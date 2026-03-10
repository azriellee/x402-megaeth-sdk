import { useState, useEffect } from 'react';
import './App.css';
import { BrowserProviderPayer, createX402Fetch } from 'x402-megaeth-sdk';

// Add type for window.ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}

const SERVER_URL = 'http://localhost:3402';

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
      // Create payer mapped to the connected wallet
      const payer = new BrowserProviderPayer(window.ethereum, address);
      
      // Wrap fetch to automatically handle 402 responses
      const x402Fetch = createX402Fetch(payer);

      // Make the request using our wrapped fetch!
      const res = await x402Fetch(`${SERVER_URL}${endpoint}`);
      const responseData = await res.json();
      
      setData(responseData);
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
        <h1 className="title">x402 MegaETH SDK Demo</h1>
        <p className="subtitle">Gasless ⚡ USDM & Native Micropayments in 2 lines of code</p>
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
          Attempt to access these APIs. The SDK will intercept the 402 and automatically pop up your wallet!
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
