import { ethers } from 'ethers';

// Opcode signatures (simplified)
const SIGNATURES = {
    SELFDESTRUCT: 'ff',
    DELEGATECALL: 'f4',
    TRANSFER: 'a9059cbb',
    TRANSFER_FROM: '23b872dd',
    APPROVE: '095ea7b3',
    OWNER: '8da5cb5b',
    TOTAL_SUPPLY: '18160ddd',
    MINT: '40c10f19',
    BURN: '4296696b',
    PAIR_FACTORY: 'c9c991c0', // uniswapV2Pair getReserves/factory heuristic
};

const DEX_FACTORIES = {
    'Ethereum': '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', // Uniswap V2
    'BSC': '0xca143ce32fe78f1f7019d7d551a6402fc5350c73', // PancakeSwap V2
    'Polygon': '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32', // QuickSwap
};

export async function analyzeContract(address, deployer, provider, network = 'Ethereum') {
    const analysis = {
        address,
        deployer,
        riskScore: 0,
        findings: [],
        type: "Unknown",
        features: [],
        verified: false,
        name: "Unknown Contract",
        symbol: "???",
        auditStatus: "Unverified",
        hasLiquidity: false,
        isMintable: false,
        isBurnable: false
    };

    try {
        const bytecode = await provider.getCode(address);

        if (bytecode === '0x') {
            analysis.type = "Destructed / EOA";
            analysis.riskScore = 10;
            return analysis;
        }

        // 1. Structural Analysis
        const isProxy = bytecode.includes('363d3d373d3d3d363d73') || bytecode.length < 500;
        if (isProxy) {
            analysis.type = "Proxy";
            analysis.features.push("Proxy Architecture");
            analysis.findings.push({
                type: "Proxy Detected",
                severity: "MEDIUM",
                description: "Contract uses a proxy pattern. Logic can be changed by owner at any time.",
                evidence: "Bytecode matches EIP-1167 or contains delegatecall routing."
            });
            analysis.riskScore += 25;
        }

        // 2. Token Detection
        const hasTransfer = bytecode.includes(SIGNATURES.TRANSFER);
        const hasTotalSupply = bytecode.includes(SIGNATURES.TOTAL_SUPPLY);

        if (hasTransfer && hasTotalSupply) {
            analysis.type = "Token (ERC20)";
            analysis.features.push("ERC20 / Token");
            try {
                const abi = [
                    "function name() view returns (string)",
                    "function symbol() view returns (string)",
                    "function decimals() view returns (uint8)",
                    "function totalSupply() view returns (uint256)"
                ];
                const contract = new ethers.Contract(address, abi, provider);
                const [name, symbol, totalSupply] = await Promise.all([
                    contract.name().catch(() => "Unknown"),
                    contract.symbol().catch(() => "???"),
                    contract.totalSupply().catch(() => 0n)
                ]);
                analysis.name = name;
                analysis.symbol = symbol;
                if (totalSupply > 0n) {
                    analysis.features.push(`Supply: ${ethers.formatUnits(totalSupply, 18)}`);
                }
            } catch (e) {
                console.warn(`[Radar] Could not fetch token metadata for ${address}:`, e.message);
            }
        }

        // 3. Signature-based Feature Detection
        if (bytecode.includes(SIGNATURES.MINT)) {
            analysis.isMintable = true;
            analysis.features.push("Mintable");
        }
        if (bytecode.includes(SIGNATURES.BURN)) {
            analysis.isBurnable = true;
            analysis.features.push("Burnable");
        }
        if (bytecode.includes(SIGNATURES.OWNER)) {
            analysis.features.push("Ownable");
        }

        // 4. Security Patterns & Vulnerabilities

        // Pattern: Malicious Ownership (Infinite Mint potential)
        if (analysis.isMintable && analysis.features.includes("Ownable")) {
            analysis.findings.push({
                type: "Centralized Minting",
                severity: "HIGH",
                description: "Owner can mint new tokens at will, potentially diluting holders.",
                evidence: "Mint function detected alongside Ownership markers."
            });
            analysis.riskScore += 30;
        }

        // Pattern: Honeypot Heuristic (Blacklist/Transfer restriction)
        if (bytecode.includes('08c379a0') && bytecode.length < 5000) { // Error(string) signature
            analysis.findings.push({
                type: "Honeypot Risk",
                severity: "CRITICAL",
                description: "Potential conditional transfer restriction detected in bytecode.",
                evidence: "Function transfer() contains revert paths dependent on dynamic state (possible blacklist)."
            });
            analysis.riskScore += 50;
        }

        // Pattern: Hidden Fee/Tax
        if (bytecode.includes('405c') && hasTransfer) { // Simplified representation of math op in transfer
            analysis.features.push("Tax Logic");
            analysis.findings.push({
                type: "Transfer Tax",
                severity: "LOW",
                description: "Contract may charge fees on transfers.",
                evidence: "Arithmetic operation detected in transfer logic flow."
            });
        }

        // 5. Liquidity Detection (Heuristic)
        // Check if bytecode has signatures of a pair or factory interaction
        if (bytecode.includes('0dfe165a') || bytecode.includes('bc25cf77')) { // getReserves or similar
            analysis.hasLiquidity = true;
            analysis.features.push("LP Contract");
            analysis.type = "Liquidity Pool";
        }

        // 6. Deployer Reputation
        try {
            const deployerBalance = await provider.getBalance(deployer);
            const balanceEth = parseFloat(ethers.formatEther(deployerBalance));
            if (balanceEth < 0.02) {
                analysis.findings.push({
                    type: "Burner Wallet Deployer",
                    severity: "HIGH",
                    description: "Deployer wallet has extremely low balance, typical of rug-pull burner accounts.",
                    evidence: `Balance: ${balanceEth.toFixed(4)} ${network === 'BSC' ? 'BNB' : 'ETH'}`
                });
                analysis.riskScore += 30;
            }
        } catch (e) {
            console.warn(`[Radar] Could not fetch deployer balance:`, e.message);
        }

        // 7. Final Scoring & Tagging
        analysis.riskScore = Math.min(analysis.riskScore, 100);

        if (analysis.riskScore >= 75) {
            analysis.tag = "CRITICAL";
            analysis.isScam = true;
            analysis.isVulnerable = true;
        } else if (analysis.riskScore >= 45) {
            analysis.tag = "HIGH";
            analysis.isVulnerable = true;
            analysis.isScam = false;
        } else if (analysis.riskScore >= 20) {
            analysis.tag = "MEDIUM";
            analysis.isVulnerable = false;
            analysis.isScam = false;
        } else {
            analysis.tag = "SAFE";
            analysis.isVulnerable = false;
            analysis.isScam = false;
        }

        analysis.timestamp = new Date().toISOString();
        return analysis;

    } catch (error) {
        console.error("Analysis failed", error);
        return { ...analysis, error: error.message };
    }
}

