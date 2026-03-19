import { useState, useEffect } from 'react';
import './App.css';
import { Client } from 'x402-megaeth-sdk';
import type { PaymentRequired, PaymentRequirements } from 'x402-megaeth-sdk';

declare global {
  interface Window { ethereum?: any; }
}

const SERVER_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:3402';

interface Article {
  id: string;
  title: string;
  preview: string;
  author?: string;
  tags?: string[];
  createdAt?: string;
  priceUsd?: number;
}

interface FullArticle extends Article {
  content: string;
  paidBy: string;
  txHash: string;
  network: string;
}

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error';
}

// ── Helpers ────────────────────────────────────────────────────────

function truncateAddr(addr?: string): string {
  if (!addr || addr === 'Anonymous') return 'Anonymous';
  if (!addr.startsWith('0x')) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function avatarInitials(author?: string): string {
  if (!author || author === 'Anonymous') return '?';
  if (author.startsWith('0x')) return author.slice(2, 4).toUpperCase();
  return author.slice(0, 2).toUpperCase();
}

function readTime(text?: string): string {
  const words = (text ?? '').trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 200))} min`;
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatPrice(usd?: number): string {
  const n = usd ?? 0.05;
  const cents = Math.round(n * 100);
  return cents < 100 ? `${cents}¢` : `$${n.toFixed(2)}`;
}

// ── Sub-components ─────────────────────────────────────────────────

function SkateLogo() {
  return (
    <svg width="114" height="35" viewBox="0 0 152 47" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Skate">
      <path fillRule="evenodd" clipRule="evenodd" d="M18.8498 7.05987C17.8936 7.05987 16.8008 7.05987 15.8447 7.05987C14.6153 7.05987 13.2494 7.05984 12.02 7.19561C11.6102 7.19561 11.337 7.05986 11.0638 6.78832C10.7907 6.51679 10.6541 6.10947 10.6541 5.83794C10.7906 4.34451 10.9272 2.85109 11.0638 1.22189C11.0638 0.543058 11.6102 0.135766 12.2932 0C14.6153 0 17.074 0 19.3962 0C20.0791 0 20.6255 0.543058 20.6255 1.22189C20.7621 2.57955 20.8987 3.93721 21.0353 5.15911C21.1719 6.38101 22.1281 7.33139 23.3574 7.46716C25.2697 7.60292 27.4553 7.87446 29.7774 8.28176C30.3238 8.41753 30.7336 8.82481 30.8702 9.36788C31.2799 11.6759 31.5531 14.1197 31.8263 16.4277C31.8263 16.835 31.6897 17.2423 31.4165 17.5139C31.1433 17.7854 30.7336 17.9212 30.3238 17.9212C27.8651 17.6497 25.2697 17.5139 22.9476 17.5139C22.2646 17.5139 21.7183 16.9708 21.7183 16.292C21.5817 14.1197 21.5817 11.9475 21.4451 9.7752C21.3085 8.146 20.2157 7.05987 18.8498 7.05987Z" fill="#C6FF35"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M10.245 15.0703C10.3816 12.8981 10.3816 10.8615 10.5182 8.55352C10.5182 8.14622 10.3816 7.87471 10.1084 7.60318C9.83523 7.33165 9.42544 7.19585 9.15225 7.19585C6.96672 7.33162 4.64461 7.60316 2.18589 8.01046C1.63951 8.14623 1.22972 8.55355 1.09313 9.09662C0.68334 11.4046 0.410153 13.8484 0.136963 16.1565C0.136963 16.5637 0.273562 16.9711 0.546753 17.2426C0.819943 17.5141 1.22972 17.6499 1.63951 17.6499C3.82503 17.5141 6.01056 17.3784 8.19609 17.2426C8.74247 17.2426 9.28885 17.3784 9.69863 17.7857C10.1084 18.193 10.245 18.6003 10.245 19.1433C10.245 21.7229 10.245 24.3024 10.245 26.882C10.245 27.9681 11.0646 28.7828 12.1574 28.7828C13.5233 28.7828 14.7527 28.7828 16.1186 28.7828C17.348 28.7828 18.5773 28.7828 19.9433 28.7828C20.4897 28.7828 21.036 28.9185 21.3092 29.3258C21.719 29.7331 21.8556 30.1404 21.8556 30.6835C21.719 32.8557 21.719 34.8922 21.5824 37.2003C21.5824 37.6076 21.719 37.8791 21.9922 38.1506C22.2654 38.4222 22.6752 38.5579 22.9484 38.5579C25.1339 38.4222 27.456 38.1506 29.9147 37.7433C30.4611 37.6075 30.8709 37.2003 31.0075 36.6572C31.4173 34.3492 31.6905 31.9054 31.9637 29.5973C31.9637 29.19 31.8271 28.7827 31.5539 28.5112C31.2807 28.2397 30.8709 28.1039 30.4611 28.1039C28.2756 28.2397 26.0901 28.3754 23.9045 28.5112C23.3582 28.5112 22.8118 28.3755 22.402 27.9682C21.9922 27.5609 21.8556 27.1536 21.8556 26.6105C21.8556 24.0309 21.8556 21.4513 21.8556 18.8718C21.8556 17.7856 21.036 16.9711 19.9433 16.9711C18.5773 16.9711 17.348 16.9711 15.982 16.9711C14.7527 16.9711 13.5233 16.9711 12.1574 16.9711C11.611 16.9711 11.0646 16.8353 10.7914 16.428C10.3816 16.1565 10.1084 15.6134 10.245 15.0703Z" fill="#C6FF35"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M12.977 38.8287C13.9332 38.8287 15.026 38.9645 15.9821 38.9645C17.2115 38.9645 18.5774 38.9645 19.8068 38.8287C20.2166 38.8287 20.4898 38.9645 20.763 39.236C21.0362 39.5075 21.1728 39.9148 21.1728 40.1864C21.0362 41.6798 20.8996 43.1732 20.763 44.8024C20.763 45.4813 20.2166 45.8885 19.5336 46.0243C17.2115 46.0243 14.8894 46.0243 12.4307 46.0243C11.7477 46.0243 11.2013 45.4813 11.2013 44.8024C11.0647 43.4448 10.9281 42.0871 10.7915 40.8652C10.6549 39.6433 9.69875 38.6929 8.46939 38.5572C6.55706 38.4214 4.37154 38.1498 2.04942 37.7425C1.50304 37.6068 1.09325 37.1995 0.956651 36.6564C0.546865 34.3484 0.273679 31.9046 0.000488281 29.5966C0.000488281 29.1893 0.137077 28.782 0.410268 28.5104C0.683458 28.2389 1.09325 28.1032 1.50303 28.1032C3.96175 28.3747 6.55706 28.5104 8.87918 28.5104C9.56216 28.5104 10.1085 29.0535 10.1085 29.7323C10.1085 31.9046 10.2451 34.0769 10.3817 36.2492C10.5183 37.7426 11.6111 38.8287 12.977 38.8287Z" fill="#C6FF35"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M62.1505 28.375C62.1505 27.1531 61.3309 26.2027 60.2381 25.9312L52.7254 24.0305C49.7203 23.2159 47.6714 20.7721 47.6714 17.5137C47.6714 15.8845 48.2178 14.1195 49.4471 12.8976C50.8131 11.4042 52.5888 10.8611 54.5011 10.8611H65.2922V15.0699H54.7743C53.4084 15.0699 52.3156 16.0202 52.3156 17.3779C52.3156 18.5998 52.9986 19.4144 54.0914 19.6859L61.4675 21.5866C64.6092 22.4012 66.6581 24.9808 66.6581 28.2392C66.6581 30.0042 66.1117 31.7691 64.8824 32.991C63.5164 34.4844 61.7407 35.1633 59.6918 35.1633H48.491V30.8188H59.5552C61.0577 30.8188 62.1505 29.7326 62.1505 28.375Z" fill="white"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M130.996 15.0701V10.7255H112.829V15.0701H119.522V35.1635H124.303V15.0701H130.996Z" fill="white"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M151.075 35.1635V30.9547H139.191V24.981H149.435V20.7722H139.191V15.0701H151.075V10.7255H134.41V35.1635H151.075Z" fill="white"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M70.4836 10.7255H75.2645V20.908H79.4989L84.2798 10.7255H89.3338L84.553 20.908H85.0993C86.1921 20.908 87.1483 21.3153 87.8312 21.9941C88.5142 22.673 88.924 23.6233 88.924 24.7095V35.0277H84.1432V24.8452H75.2645V35.0277H70.4836V10.7255Z" fill="white"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M102.72 17.9212C100.671 23.6233 98.7588 29.4613 96.8465 35.1635H91.7925L100.671 10.7255H104.496L113.511 35.1635H108.457C106.545 29.4613 104.769 23.6233 102.72 17.9212Z" fill="white"/>
    </svg>
  );
}

function Toasts({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
      ))}
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────

export default function App() {
  const [address, setAddress] = useState('');
  const [articles, setArticles] = useState<Article[]>([]);
  const [activeArticle, setActiveArticle] = useState<FullArticle | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [showWrite, setShowWrite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [writeForm, setWriteForm] = useState({ title: '', content: '', tags: '', priceUsd: '0.05' });
  const [selectionModal, setSelectionModal] = useState<{
    required: PaymentRequired;
    resolve: (req: PaymentRequirements | undefined) => void;
  } | null>(null);

  const addToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  const fetchArticles = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/articles`);
      const data = await res.json();
      setArticles(data);
    } catch (e) {
      console.error('Failed to fetch articles', e);
    }
  };

  useEffect(() => {
    if (typeof window.ethereum !== 'undefined') {
      window.ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
        if (accounts.length > 0) setAddress(accounts[0]);
      });
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        setAddress(accounts.length > 0 ? accounts[0] : '');
      });
    }
    fetchArticles();
  }, []);

  const connectWallet = async () => {
    if (typeof window.ethereum === 'undefined') {
      addToast('Install MetaMask or another Web3 wallet first', 'error');
      return;
    }
    try {
      const [account] = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setAddress(account);
    } catch {
      // user rejected
    }
  };

  const readArticle = async (articleId: string) => {
    if (!address) {
      addToast('Connect your wallet to read articles', 'error');
      return;
    }
    setLoadingId(articleId);
    try {
      const payer = new Client.BrowserProviderPayer(window.ethereum, address);
      const x402Fetch = Client.createX402Fetch(payer, {
        onPaymentRequired: (paymentRequired) =>
          new Promise((resolve) => {
            setSelectionModal({
              required: paymentRequired,
              resolve: (req) => {
                setSelectionModal(null);
                resolve(req);
              },
            });
          }),
      });

      const res = await x402Fetch(`${SERVER_URL}/articles/${articleId}`);

      if (res.status === 200) {
        const data: FullArticle = await res.json();
        setActiveArticle(data);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (res.status !== 402) {
        const err = await res.text();
        addToast(`Error ${res.status}: ${err}`, 'error');
      }
    } catch (e: any) {
      if (e?.message !== 'Selection cancelled') {
        addToast(e?.message ?? 'Payment failed', 'error');
      }
    } finally {
      setLoadingId(null);
    }
  };

  const createArticle = async () => {
    if (!writeForm.title.trim() || !writeForm.content.trim()) {
      addToast('Title and content are required', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const tags = writeForm.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 5);
      const priceUsd = Math.max(0.001, Math.min(100, parseFloat(writeForm.priceUsd) || 0.05));

      const res = await fetch(`${SERVER_URL}/articles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: writeForm.title.trim(),
          content: writeForm.content.trim(),
          author: address || 'Anonymous',
          tags,
          priceUsd,
        }),
      });

      if (res.ok) {
        const created = await res.json();
        setWriteForm({ title: '', content: '', tags: '', priceUsd: '0.05' });
        setShowWrite(false);
        await fetchArticles();
        addToast(`"${created.title}" published`);
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to publish' }));
        addToast(err.error ?? 'Failed to publish', 'error');
      }
    } catch (e: any) {
      addToast(e?.message ?? 'Failed to publish', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Article view ──────────────────────────────────────────────────

  if (activeArticle) {
    return (
      <>
        <nav className="navbar">
          <div className="navbar-logo"><SkateLogo /></div>
          <div className="navbar-actions">
            <span className="network-badge"><span className="network-dot" /> MegaETH</span>
          </div>
        </nav>
        <main className="main-content article-view">
          <button className="article-view-back" onClick={() => setActiveArticle(null)}>
            ← Back to publications
          </button>
          <header className="article-view-header">
            {activeArticle.tags && activeArticle.tags.length > 0 && (
              <div className="article-view-tags">
                {activeArticle.tags.map(t => <span key={t} className="tag">{t}</span>)}
              </div>
            )}
            <h1 className="article-view-title">{activeArticle.title}</h1>
            <div className="article-view-byline">
              <div className="byline-avatar">{avatarInitials(activeArticle.author || activeArticle.paidBy)}</div>
              <div className="byline-info">
                <span className="byline-name">{truncateAddr(activeArticle.author || activeArticle.paidBy)}</span>
                <span className="byline-sub">{readTime(activeArticle.content)} read · Unlocked via x402</span>
              </div>
            </div>
          </header>
          <div className="article-view-body">
            {activeArticle.content.split('\n').filter(p => p.trim()).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
          <div className="payment-proof">
            <div className="payment-proof-header">✓ &nbsp;Payment Verified</div>
            <div className="payment-proof-row">
              <span className="proof-label">Status</span>
              <span className="proof-value success">Confirmed on MegaETH</span>
            </div>
            <div className="payment-proof-row">
              <span className="proof-label">Price</span>
              <span className="proof-value">{formatPrice(activeArticle.priceUsd)}</span>
            </div>
            <div className="payment-proof-row">
              <span className="proof-label">Payer</span>
              <span className="proof-value">{truncateAddr(activeArticle.paidBy)}</span>
            </div>
            <div className="payment-proof-row">
              <span className="proof-label">Transaction</span>
              <span className="proof-value">
                <a href={`https://mega.etherscan.io/tx/${activeArticle.txHash}`} target="_blank" rel="noreferrer">
                  {activeArticle.txHash?.slice(0, 22)}…
                </a>
              </span>
            </div>
          </div>
        </main>
        <Toasts toasts={toasts} />
      </>
    );
  }

  // ── Feed view ─────────────────────────────────────────────────────

  return (
    <>
      <nav className="navbar">
        <div className="navbar-logo"><SkateLogo /></div>
        <div className="navbar-actions">
          <span className="network-badge"><span className="network-dot" /> MegaETH</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowWrite(true)}>✦ Write</button>
          {address ? (
            <div className="btn btn-outline btn-sm wallet-btn">
              <span className="wallet-dot" />
              {truncateAddr(address)}
            </div>
          ) : (
            <button className="btn btn-accent btn-sm" onClick={connectWallet}>Connect Wallet</button>
          )}
        </div>
      </nav>

      <main className="main-content">
        <div className="feed-header">
          <div className="feed-eyebrow">x402 · MegaETH · Pay-per-read</div>
          <h1 className="feed-title">Skate Publications</h1>
          <p className="feed-subtitle">
            Decentralised journalism powered by micropayments.
            Read what matters, pay only for what you read.
          </p>
        </div>

        <div className="article-list">
          {articles.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">✦</span>
              <h3>No articles yet</h3>
              <p>Be the first to publish something worth reading.</p>
            </div>
          ) : (
            articles.map((article) => (
              <article key={article.id} className="article-card">
                <div className="article-meta-top">
                  <div className="author-chip">
                    <div className="author-avatar">{avatarInitials(article.author)}</div>
                    <span className="author-name">{truncateAddr(article.author)}</span>
                  </div>
                  {article.createdAt && (
                    <><span className="sep-dot" /><span className="article-date">{formatDate(article.createdAt)}</span></>
                  )}
                  {article.tags?.slice(0, 2).map(t => <span key={t} className="tag">{t}</span>)}
                </div>
                <div className="article-title-link" onClick={() => readArticle(article.id)}>{article.title}</div>
                <p className="article-excerpt">{article.preview}</p>
                <div className="article-meta-bottom">
                  <div className="read-info">
                    <span className="price-lock">🔒 {formatPrice(article.priceUsd)}</span>
                    <span>{readTime(article.preview)} read</span>
                  </div>
                  <button className="btn btn-accent btn-sm" onClick={() => readArticle(article.id)} disabled={loadingId === article.id}>
                    {loadingId === article.id ? <><span className="spinner" /> Paying…</> : `Read for ${formatPrice(article.priceUsd)}`}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </main>

      {/* Write modal */}
      {showWrite && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowWrite(false)}>
          <div className="modal modal-wide">
            <div className="modal-header">
              <h2 className="modal-title">Write an Article</h2>
              <button className="modal-close" onClick={() => setShowWrite(false)}>×</button>
            </div>
            {!address && (
              <div className="write-notice">
                Connect your wallet to publish under your address, or continue to publish anonymously.
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Title</label>
              <input className="form-input" type="text" placeholder="Something worth reading..." value={writeForm.title} onChange={e => setWriteForm(f => ({ ...f, title: e.target.value }))} maxLength={120} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Content</label>
              <textarea className="form-textarea" placeholder="Write your article here..." value={writeForm.content} onChange={e => setWriteForm(f => ({ ...f, content: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Tags</label>
              <input className="form-input" type="text" placeholder="MegaETH, DeFi, Web3  (comma-separated)" value={writeForm.tags} onChange={e => setWriteForm(f => ({ ...f, tags: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Price (USD)</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9rem', pointerEvents: 'none' }}>$</span>
                <input className="form-input" type="number" min="0.001" max="100" step="0.01" style={{ paddingLeft: '1.75rem' }} value={writeForm.priceUsd} onChange={e => setWriteForm(f => ({ ...f, priceUsd: e.target.value }))} />
              </div>
              <p className="form-hint">
                Readers pay this amount in ETH or USDM to unlock the full article.
                {writeForm.priceUsd && !isNaN(parseFloat(writeForm.priceUsd)) && (
                  <> That's <strong style={{ color: 'var(--accent)' }}>{formatPrice(parseFloat(writeForm.priceUsd))}</strong>.</>
                )}
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">Author</label>
              <input className="form-input" type="text" value={address ? truncateAddr(address) : 'Anonymous'} disabled />
            </div>
            <div className="form-actions">
              <button className="btn btn-outline" onClick={() => setShowWrite(false)}>Cancel</button>
              <button className="btn btn-accent" onClick={createArticle} disabled={submitting || !writeForm.title.trim() || !writeForm.content.trim()}>
                {submitting ? <><span className="spinner" /> Publishing…</> : 'Publish Article'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment selection modal */}
      {selectionModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Choose Payment</h2>
              <button className="modal-close" onClick={() => selectionModal.resolve(undefined)}>×</button>
            </div>
            <p className="payment-description">{selectionModal.required.resource.description}</p>
            <div className="payment-options">
              {selectionModal.required.accepts.map((req: PaymentRequirements, idx: number) => (
                <div key={idx} className={`payment-option ${req.asset.toLowerCase()}`} onClick={() => selectionModal.resolve(req)}>
                  <div className="payment-option-icon">{req.asset === 'ETH' ? '⬡' : '◈'}</div>
                  <div className="payment-option-asset">{req.asset}</div>
                  <div className="payment-option-amount">{(req.extra as any)?.priceLabel ?? '5¢'}</div>
                  <div className="payment-option-type">{req.scheme === 'exact-native' ? 'Direct transfer' : 'Gasless permit'}</div>
                </div>
              ))}
            </div>
            <button className="btn btn-outline btn-full" onClick={() => selectionModal.resolve(undefined)}>Cancel</button>
          </div>
        </div>
      )}

      <Toasts toasts={toasts} />
    </>
  );
}
