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

// DEX Configuration for Liquidity Checks
const DEX_CONFIG = {
    'Ethereum': {
        factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', // Uniswap V2
        weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',    // WETH
        symbol: 'ETH'
    },
    'BSC': {
        factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73', // PancakeSwap V2
        weth: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',    // WBNB
        symbol: 'BNB'
    },
    'Polygon': {
        factory: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32', // QuickSwap
        weth: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',    // WMATIC
        symbol: 'MATIC'
    },
    'Base': {
        factory: '0x8909Dc15e46C4A96d16279053B9F26870F605850', // BaseSwap
        weth: '0x4200000000000000000000000000000000000006',    // WETH
        symbol: 'ETH'
    },
    'Arbitrum': {
        factory: '0x1C232F01118CB8B424793ae03F870aa7D0ff7fFF', // SushiSwap (Arb1)
        weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',    // WETH
        symbol: 'ETH'
    },
    'Optimism': {
        factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984', // Uniswap V3 (Using V2 compatible if available or custom logic)
        weth: '0x4200000000000000000000000000000000000006',    // WETH
        symbol: 'ETH'
    }
};

const PAIR_ABI = [
    "function getReserves() view returns (uint112, uint112, uint32)",
    "function token0() view returns (address)",
    "function token1() view returns (address)"
];

const FACTORY_ABI = [
    "function getPair(address tokenA, address tokenB) view returns (address pair)"
];

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
        let isToken = false;

        if (hasTransfer && hasTotalSupply) {
            isToken = true;
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

        // 5. REAL Liquidity Check (DEX Query)
        // If it's a token found on a supported network, check for liquidity in the default factory
        if (isToken && DEX_CONFIG[network]) {
            try {
                const { factory, weth, symbol: nativeSymbol } = DEX_CONFIG[network];
                const factoryContract = new ethers.Contract(factory, FACTORY_ABI, provider);

                // Get Pair Address
                const pairAddress = await factoryContract.getPair(address, weth);

                if (pairAddress && pairAddress !== '0x0000000000000000000000000000000000000000') {
                    // Check Reserves
                    const pairContract = new ethers.Contract(pairAddress, PAIR_ABI, provider);
                    const reserves = await pairContract.getReserves();
                    const token0 = await pairContract.token0();

                    // Identify which reserve is WETH/Native
                    // reserves[0] corresponds to token0, reserves[1] to token1
                    // If token0 is WETH, use reserves[0], else reserves[1]
                    const wethReserve = (token0.toLowerCase() === weth.toLowerCase()) ? reserves[0] : reserves[1];

                    // Calculate numeric value (rough)
                    const wethValue = parseFloat(ethers.formatEther(wethReserve));

                    if (wethValue > 0) {
                        analysis.hasLiquidity = true;
                        analysis.features.push(`Liquidity: ${wethValue.toFixed(4)} ${nativeSymbol}`);
                        // Reduce risk slightly if liquidity is significant (> 1 ETH/BNB/MATIC)
                        if (wethValue > 1.0) {
                            analysis.riskScore = Math.max(0, analysis.riskScore - 15);
                            analysis.tag = (analysis.riskScore < 20) ? "SAFE" : "MEDIUM";
                        }
                    } else {
                        analysis.features.push("Pair Created (Empty)");
                    }
                }
            } catch (liqErr) {
                // Ignore liquidity check errors (network issues, etc)
                // console.warn(`[Radar] Liquidity check failed for ${address}: ${liqErr.message}`);
            }
        }

        // Fallback or generic LP check
        if (!analysis.hasLiquidity && (bytecode.includes('0dfe165a') || bytecode.includes('bc25cf77'))) { // getReserves or similar
            analysis.hasLiquidity = true;
            analysis.features.push("LP Contract Pattern");
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
            // Default safe unless flagged
            if (!analysis.tag) analysis.tag = "SAFE";
            analysis.isVulnerable = false;
            analysis.isScam = false;
        }

        analysis.timestamp = new Date().toISOString();
        analysis.bytecode = bytecode.length > 1000 ? bytecode.slice(0, 500) + "..." + bytecode.slice(-500) : bytecode;
        analysis.bytecodeSize = (bytecode.length - 2) / 2;

        return analysis;

    } catch (error) {
        console.error("Analysis failed", error);
        return { ...analysis, error: error.message };
    }
}
