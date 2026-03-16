import { useState, useEffect } from 'react';
import './App.css';
import { Client } from 'x402-megaeth-sdk';
import type { PaymentRequired, PaymentRequirements } from 'x402-megaeth-sdk';

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
  const [data, setData] = useState<any>(null); // For general responses (health checks)
  const [articles, setArticles] = useState<any[]>([]);
  const [activeArticle, setActiveArticle] = useState<any | null>(null); // Store full article after payment

  // Selection state
  const [selectionModal, setSelectionModal] = useState<{
    required: PaymentRequired;
    resolve: (req: PaymentRequirements | undefined) => void;
  } | null>(null);

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

    // Fetch article previews
    fetch(`${SERVER_URL}/articles`)
      .then(res => res.json())
      .then(setArticles)
      .catch(console.error);
  }, []);

  const fetchProtected = async (endpoint: string, isArticle: boolean = false) => {
    if (!address) {
      alert('Please connect wallet first!');
      return;
    }

    setLoading(true);
    try {
      const payer = new Client.BrowserProviderPayer(window.ethereum, address);

      const x402Fetch = Client.createX402Fetch(payer, {
        onPaymentRequired: (paymentRequired) => {
          return new Promise((resolve) => {
            setSelectionModal({
              required: paymentRequired,
              resolve: (req) => {
                setSelectionModal(null);
                resolve(req);
              }
            });
          });
        }
      });

      const res = await x402Fetch(`${SERVER_URL}${endpoint}`);

      if (res.status === 200) {
        const responseData = await res.json();
        if (isArticle) {
          setActiveArticle(responseData);
          // Scroll to top when opening an article
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          setData(responseData);
        }
      } else if (res.status === 402) {
        console.log("Payment cancelled/failed");
      } else {
        const err = await res.text();
        alert(`Error ${res.status}: ${err}`);
      }
    } catch (e: any) {
      console.error(e);
      if (e.message !== 'Selection cancelled') {
        alert("Error: " + e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // If we have an active article, show the dedicated article view
  if (activeArticle) {
    return (
      <div className="article-page" style={{ animation: 'fadeIn 0.5s ease-out' }}>
        <div style={{ textAlign: 'left', marginBottom: '2rem' }}>
          <button className="button button-outline" onClick={() => setActiveArticle(null)}>
            ← Back to Newsroom
          </button>
        </div>

        <div className="card" style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'left' }}>
          <div className="header" style={{ marginBottom: '2rem' }}>
            <span className="badge badge-eth" style={{ marginBottom: '1rem' }}>Paid Article</span>
            <h1 className="title" style={{ fontSize: '2.5rem', textAlign: 'left' }}>{activeArticle.title}</h1>
            <p className="subtitle" style={{ textAlign: 'left' }}>Purchased via x402 Micropayment on MegaETH</p>
          </div>

          <div className="resource-content" style={{ fontSize: '1.2rem', lineHeight: '1.8', background: 'transparent', border: 'none', padding: 0 }}>
            <p>{activeArticle.content}</p>
          </div>

          <div style={{ marginTop: '4rem', padding: '1.5rem', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: '#60a5fa' }}>Payment Details</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Status:</span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>Verified ✓</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Price:</span>
                <span style={{ color: '#f8fafc' }}>5¢ USD</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Payer:</span>
                <span style={{ fontFamily: 'monospace', color: '#f8fafc' }}>{activeArticle.paidBy}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Transaction:</span>
                <a
                  href={`https://mega.etherscan.io/tx/${activeArticle.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontFamily: 'monospace', color: '#60a5fa', textDecoration: 'none' }}
                >
                  {activeArticle.txHash?.slice(0, 24)}...
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="header">
        <h1 className="title">x402 Newsroom</h1>
        <p className="subtitle">Premium Journalism, No Subscriptions Required</p>
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

      <div className="demo-sections">
        {/* Section 1: Health Checks */}
        <div className="card">
          <h2 className="section-title">
            <span>🛡️</span> System Health
          </h2>
          <p style={{ color: '#94a3b8', marginBottom: '1.5rem', textAlign: 'left' }}>
            Low-latency API access demo. Gated with x402 to prevent sybil attacks while maintaining sub-millisecond block performance.
          </p>

          <div className="actions" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button
              className="button"
              onClick={() => fetchProtected('/health')}
              disabled={loading || !address}
              style={{ width: '100%', justifyContent: 'space-between' }}
            >
              <span>Access ETH Health Check</span>
              <span className="badge badge-eth">0.2¢ ETH</span>
            </button>

            <button
              className="button button-outline"
              onClick={() => fetchProtected('/usdm-health')}
              disabled={loading || !address}
              style={{ width: '100%', justifyContent: 'space-between' }}
            >
              <span>Access USDM Health Check</span>
              <span className="badge badge-usdm">2¢ USDM</span>
            </button>
          </div>

          {data && data.status && (
            <div className="resource-content">
              <h4 style={{ margin: '0 0 0.5rem 0', color: '#60a5fa' }}>Status: {data.status}</h4>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#cbd5e1' }}>{data.message}</p>
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                TX Ref: {data.txHash?.slice(0, 10)}...
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Tailored Articles */}
        <div className="card">
          <h2 className="section-title">
            <span>📰</span> Featured Articles
          </h2>
          <p style={{ color: '#94a3b8', marginBottom: '1.5rem', textAlign: 'left' }}>
            Unlock high-quality journalism instantly. No credit cards, no monthly fees—just one click to read.
          </p>

          <div className="article-grid">
            {articles.map(article => (
              <div key={article.id} className="article-card">
                <h3 className="article-title">{article.title}</h3>
                <p className="article-preview">{article.preview}</p>
                <button
                  className="button button-secondary"
                  onClick={() => fetchProtected(`/articles/${article.id}`, true)}
                  disabled={loading || !address}
                  style={{ marginTop: '0.5rem' }}
                >
                  {loading ? <span className="loading" /> : null}
                  Read Full Article — 5¢
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Selection Modal */}
      {selectionModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 style={{ marginTop: 0 }}>Choose Payment Method</h2>
            <p style={{ color: '#94a3b8' }}>
              {selectionModal.required.resource.description}
            </p>

            <div className="payment-options">
              {selectionModal.required.accepts.map((req: PaymentRequirements, idx: number) => (
                <div
                  key={idx}
                  className="option-card"
                  onClick={() => selectionModal.resolve(req)}
                >
                  <span className={`badge badge-${req.asset.toLowerCase()}`}>
                    {req.asset}
                  </span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                    {(req.extra as any)?.priceLabel || (req.asset === 'ETH' ? '?' : '5¢')}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    {req.scheme === 'exact-native' ? 'Direct Transfer' : 'EIP-2612 Permit'}
                  </div>
                </div>
              ))}
            </div>

            <button
              className="button button-outline"
              onClick={() => selectionModal.resolve(undefined)}
              style={{ marginTop: '2rem', width: '100%' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
