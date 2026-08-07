import { Component } from 'react'

// Catches any uncaught render error anywhere in the tree and shows a
// recoverable screen instead of a blank white page. This is a hard
// requirement, not a nice-to-have -- a single bug in ANY feature (a bad
// paste, corrupted localStorage, whatever) would otherwise take down the
// entire app with no way back except clearing browser storage manually.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('BetLab crashed:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ background:'#060608', minHeight:'100vh', color:'#e8e6df', padding:20, fontFamily:'-apple-system, sans-serif' }}>
          <h1 style={{ fontSize:'1.2rem', color:'#f87171', marginBottom:8 }}>Something crashed</h1>
          <p style={{ fontSize:'.8rem', color:'#a0a0c0', marginBottom:16, lineHeight:1.5 }}>
            The app hit an unexpected error and stopped rendering. Your data is still safe in storage —
            this screen just means one piece of the UI broke, not that anything was lost.
          </p>
          <div style={{ background:'#0c0c1a', border:'1px solid #7f1d1d', borderRadius:8, padding:10, marginBottom:16, fontSize:'.65rem', color:'#f87171', fontFamily:'monospace', wordBreak:'break-word' }}>
            {String(this.state.error?.message || this.state.error || 'Unknown error')}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ padding:'10px 18px', background:'#2563eb', border:'none', borderRadius:8, color:'#fff', fontSize:'.85rem', fontWeight:700 }}
          >
            Reload App
          </button>
          <p style={{ fontSize:'.6rem', color:'#505070', marginTop:16 }}>
            If reload doesn't fix it, tell Claude the exact error message above — that pinpoints exactly what broke.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
