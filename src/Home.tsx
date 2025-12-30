// src/components/Home.tsx
import { useWallet } from '@txnlab/use-wallet-react'
import React, { useState } from 'react'
import ConnectWallet from './components/ConnectWallet'
import TrustVaultInterface from './components/TrustVaultInterface'

interface HomeProps {}

const Home: React.FC<HomeProps> = () => {
  const [openWalletModal, setOpenWalletModal] = useState<boolean>(false)
  const { activeAddress } = useWallet()

  const toggleWalletModal = () => {
    setOpenWalletModal(!openWalletModal)
  }

  // --- STATE 1: USER IS CONNECTED ---
  // If the wallet is connected, we immediately show the full Dashboard.
  if (activeAddress) {
    return (
      <>
        <TrustVaultInterface />
        {/* Keep the modal mounted in case we need it later, though usually unnecessary here */}
        <ConnectWallet openModal={openWalletModal} closeModal={toggleWalletModal} />
      </>
    )
  }

  // --- STATE 2: LANDING / LOGIN SCREEN ---
  // If NOT connected, we show the "Vault Door" (Login Screen)
  // We apply the SAME dark theme here so the transition is seamless.
  return (
    <div className="min-h-screen w-full bg-[#0a0f1c] font-['Outfit'] text-[#d8f5f2] flex flex-col justify-center items-center relative overflow-hidden">
       {/* 1. Inject Fonts & Styles (Same as Dashboard) */}
       <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet" />
       <style>{`
        :root {
          --teal: #03c6b8;
          --cyan: #00aaff;
          --text: #d8f5f2;
        }
        .glass-card {
          background: rgba(13, 20, 35, 0.7);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(3, 198, 184, 0.2);
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
        }
        .gradient-text {
          background: linear-gradient(135deg, var(--teal), var(--cyan));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .btn-glow {
          background: linear-gradient(135deg, var(--teal) 0%, var(--cyan) 100%);
          border: none;
          color: #000;
          font-weight: 600;
          transition: all 0.3s ease;
        }
        .btn-glow:hover {
          box-shadow: 0 0 20px rgba(3, 198, 184, 0.4);
          transform: translateY(-2px);
        }
       `}</style>

       {/* Background Effects */}
       <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[#03c6b8] opacity-[0.05] blur-[100px] pointer-events-none"></div>
       <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[#00aaff] opacity-[0.05] blur-[100px] pointer-events-none"></div>

       {/* Main Login Card */}
       <div className="glass-card p-10 rounded-3xl max-w-lg w-full text-center space-y-8 relative z-10 mx-4">
          
          {/* Logo / Title */}
          <div className="space-y-2">
            <div className="text-6xl mb-4">🛡️</div>
            <h1 className="text-5xl font-bold gradient-text tracking-tight">TrustVault</h1>
            <p className="text-[#9fd5d0] text-lg">Secure your legacy on Algorand.</p>
          </div>

          <div className="divider h-[1px] bg-[#03c6b8] opacity-20 mx-10"></div>

          {/* Connect Button */}
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Connect your wallet to access your vault.</p>
            <button 
              data-test-id="connect-wallet" 
              className="btn-glow w-full py-4 rounded-xl text-lg shadow-lg" 
              onClick={toggleWalletModal}
            >
              Connect Wallet
            </button>
          </div>
       </div>

       {/* Footer */}
       <div className="absolute bottom-4 text-[#9fd5d0] text-xs opacity-50">
          Powered by Algorand Blockchain
       </div>

       {/* The Actual Wallet Popup Component */}
       <ConnectWallet openModal={openWalletModal} closeModal={toggleWalletModal} />
    </div>
  )
}

export default Home
