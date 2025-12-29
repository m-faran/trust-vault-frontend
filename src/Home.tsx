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

  // --- THE FIX ---
  // If the user is connected, we return the Interface IMMEDIATELY.
  // This removes it from the 'hero' and 'card' wrappers below, allowing it to be full screen.
  if (activeAddress) {
    return (
      <>
        <TrustVaultInterface />
        {/* We keep the ConnectWallet modal mounted just in case it's needed for switching accounts, 
            though usually disconnecting drops you back to the login screen. */}
        <ConnectWallet openModal={openWalletModal} closeModal={toggleWalletModal} />
      </>
    )
  }

  // --- LOGIN SCREEN ---
  // If NOT connected, we show the original card layout
  return (
    <div className="hero min-h-screen bg-teal-400">
      <div className="hero-content text-center rounded-lg p-6 max-w-lg bg-white mx-auto shadow-2xl">
        <div className="max-w-lg">
          <h1 className="text-4xl text-slate-800">
            Welcome to <div className="font-bold text-teal-600">TrustVault 🛡️</div>
          </h1>
          <p className="py-6 text-slate-600">
            Please connect your wallet to get started.
          </p>

          <button 
            data-test-id="connect-wallet" 
            className="btn btn-primary m-2 w-full max-w-xs" 
            onClick={toggleWalletModal}
          >
            Connect Wallet
          </button>

          <ConnectWallet openModal={openWalletModal} closeModal={toggleWalletModal} />
        </div>
      </div>
    </div>
  )
}

export default Home
