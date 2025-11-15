// src/components/Home.tsx
import { useWallet } from '@txnlab/use-wallet-react'
import React, { useState } from 'react'
import ConnectWallet from './components/ConnectWallet'
// 1. Import your new component
import TrustVaultInterface from './components/TrustVaultInterface'

interface HomeProps {}

const Home: React.FC<HomeProps> = () => {
  const [openWalletModal, setOpenWalletModal] = useState<boolean>(false)
  // 2. We removed the 'openDemoModal' state
  const { activeAddress } = useWallet()

  const toggleWalletModal = () => {
    setOpenWalletModal(!openWalletModal)
  }

  // 3. We removed the 'toggleDemoModal' function

  return (
    <div className="hero min-h-screen bg-teal-400">
      <div className="hero-content text-center rounded-lg p-6 max-w-lg bg-white mx-auto">
        <div className="max-w-lg">
          <h1 className="text-4xl">
            Welcome to <div className="font-bold">TrustVault 🛡️</div>
          </h1>
          <p className="py-6">
            {activeAddress
              ? 'You are connected. Manage your vault below.'
              : 'Please connect your wallet to get started.'}
          </p>

          <div className="grid">
            {/* 4. The Wallet Connection button is now the main focus */}
            {!activeAddress && (
              <button data-test-id="connect-wallet" className="btn btn-primary m-2" onClick={toggleWalletModal}>
                Connect Wallet
              </button>
            )}

            {/* 5. Once connected, show the TrustVaultInterface instead of the demo button */}
            {activeAddress && <TrustVaultInterface />}
          </div>

          <ConnectWallet openModal={openWalletModal} closeModal={toggleWalletModal} />
          {/* 6. We removed the <Transact /> component */}
        </div>
      </div>
    </div>
  )
}

export default Home