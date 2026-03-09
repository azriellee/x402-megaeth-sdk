import { useState, useEffect } from 'react';
import './App.css';
import { createWalletClient, createPublicClient, custom, parseAbi } from 'viem';

// Add type for window.ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}

const SERVER_URL = 'http://localhost:3402';

// Manually mapping what we need rather than relying on unbuilt x402 package inside vite workspace
const MEGAETH_CHAIN_ID = 4326;
const USDM_ADDRESS = '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7' as `0x${string}`;

const megaeth = {
  id: MEGAETH_CHAIN_ID,
  name: 'MegaETH',
  network: 'megaeth',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.megaeth.com'] },
    public: { http: ['https://rpc.megaeth.com'] },
  },
} as const;

function App() {
  const [address, setAddress] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const connectWallet = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const [account] = await window.ethereum.request({ method: 'eth_requestAccounts' });
        setAddress(account);
      } catch (error) {
        console.error('User rejected connection', error);
      }
    } else {
      alert('Please install MetaMask or another Web3 wallet');
    }
  };

  useEffect(() => {
    if (typeof window.ethereum !== 'undefined') {
      window.ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
        if (accounts.length > 0) setAddress(accounts[0]);
      });
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length > 0) setAddress(accounts[0]);
        else setAddress('');
      });
    }
  }, []);

  const fetchProtected = async (endpoint: string) => {
    if (!address) {
      alert('Please connect wallet first!');
      return;
    }
    setLoading(true);
    try {
      // 1. Initial request
      const res = await fetch(`${SERVER_URL}${endpoint}`);
      if (res.status === 402) {
        // We got a 402 Payment Required!
        const paymentHeader = res.headers.get("PAYMENT-REQUIRED");
        const required = paymentHeader ? JSON.parse(atob(paymentHeader)) : await res.json();

        console.log("Payment Required:", required);

        let targetAccepts = required.accepts[0];

        const walletClient = createWalletClient({
          account: address as `0x${string}`,
          chain: megaeth as any, // Type hack for viem 2.x
          transport: custom(window.ethereum)
        });

        // Use public client to read nonce
        const publicClient = createPublicClient({
          chain: megaeth as any,
          transport: custom(window.ethereum)
        });

        let payloadData: any;

        if (targetAccepts.scheme === "exact-native") {
          const txHash = await window.ethereum.request({
            method: "eth_sendTransaction",
            params: [{
              from: address,
              to: targetAccepts.payTo,
              value: BigInt(targetAccepts.amount).toString(16),
            }]
          });
          // Wait briefly (in reality we should wait for receipt)
          await new Promise(r => setTimeout(r, 2000));

          payloadData = {
            txHash,
            from: address,
            chainId: MEGAETH_CHAIN_ID
          };
        } else if (targetAccepts.scheme === "permit-erc20") {
          // 1. Get current nonce
          const erc20Abi = parseAbi(["function nonces(address owner) view returns (uint256)"]);
          const nonce = await publicClient.readContract({
            address: USDM_ADDRESS,
            abi: erc20Abi,
            functionName: "nonces",
            args: [address as `0x${string}`],
          });

          // 2. Set deadline (1 min from now)
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 60);

          // 3. Domain
          const domain = {
            name: "MegaUSD",
            version: "1",
            chainId: MEGAETH_CHAIN_ID,
            verifyingContract: USDM_ADDRESS,
          } as const;

          // 4. Sign typed data
          const message = {
            owner: address as `0x${string}`,
            spender: targetAccepts.extra?.spender as `0x${string}`,
            value: BigInt(targetAccepts.amount),
            nonce: nonce as bigint,
            deadline,
          } as const;

          const signature = await walletClient.signTypedData({
            domain,
            types: {
              Permit: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
                { name: "value", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" },
              ],
            },
            primaryType: "Permit",
            message,
          });

          // Parse signature (r, s, v) -> The viem signature is a hex string (130 chars after 0x)
          const r = signature.slice(0, 66) as `0x${string}`;
          const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
          const vHex = signature.slice(130, 132);
          // handle possible 00/01 v mapping to 27/28
          let v = parseInt(vHex, 16);
          if (v < 27) v += 27;

          payloadData = {
            from: address,
            chainId: MEGAETH_CHAIN_ID,
            permitSignature: { v, r, s, deadline: Number(deadline) }
          };
        }

        const payload = {
          x402Version: 2,
          accepted: targetAccepts,
          payload: payloadData
        };

        const retryRes = await fetch(`${SERVER_URL}${endpoint}`, {
          headers: {
            "PAYMENT-SIGNATURE": btoa(JSON.stringify(payload))
          }
        });
        const finalData = await retryRes.json();
        setData(finalData);

      } else {
        const _data = await res.json();
        setData(_data);
      }
    } catch (e: any) {
      console.error(e);
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="header">
        <h1 className="title">x402 MegaETH</h1>
        <p className="subtitle">Gasless ⚡ USDM & Native Micropayments</p>
      </div>

      <div className="wallet-status">
        <div className={`status-dot ${address ? 'connected' : ''}`}></div>
        {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not Connected'}
      </div>

      {!address && (
        <div style={{ marginBottom: '2rem' }}>
          <button className="button" onClick={connectWallet}>Connect Wallet</button>
        </div>
      )}

      <div className="card">
        <h2>Protected Resources</h2>
        <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
          Attempt to access these APIs. The server will return 402, prompting a wallet transaction.
        </p>

        <div className="actions">
          <button
            className="button"
            onClick={() => fetchProtected('/health')}
            disabled={loading || !address}
          >
            {loading ? <span className="loading" /> : null}
            <span className="badge">ETH</span>
            Access /health
          </button>

          <button
            className="button button-outline"
            onClick={() => fetchProtected('/usdm-health')}
            disabled={loading || !address}
          >
            {loading ? <span className="loading" /> : null}
            <span className="badge badge-usdm">USDM</span>
            Access /usdm-health
          </button>
        </div>

        {data && (
          <div className="resource-content">
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#60a5fa' }}>Server Response</h3>
            <pre className="pre-scrollable">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
