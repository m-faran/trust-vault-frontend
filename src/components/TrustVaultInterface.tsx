import { algo, AlgorandClient } from '@algorandfoundation/algokit-utils'
import { useWallet } from '@txnlab/use-wallet-react'
import * as algosdk from 'algosdk'
import { useSnackbar } from 'notistack'
import React, { useEffect, useState } from 'react'
import { TrustVaultClient } from '../client'
import { getAlgodConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'
import Account from './Account'

interface VaultInfo {
  heir: string
  lastHeartbeat: bigint
  heartbeatInterval: bigint
  vaultBalance: bigint
}

const TrustVaultInterface: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(false)
  const [appId, setAppId] = useState(749636683)
  const [vaultInfo, setVaultInfo] = useState<VaultInfo | null>(null)
  const [totalVaults, setTotalVaults] = useState<bigint | null>(null)
  const [client, setClient] = useState<TrustVaultClient | null>(null)

  // Form states
  const [heirAddress, setHeirAddress] = useState<string>('')
  const [heartbeatInterval, setHeartbeatInterval] = useState<string>('')
  const [depositAmount, setDepositAmount] = useState<string>('')
  const [withdrawAmount, setWithdrawAmount] = useState<string>('')
  const [claimVaultOwner, setClaimVaultOwner] = useState<string>('')
  const [newHeirAddress, setNewHeirAddress] = useState<string>('')
  const [newHeartbeatInterval, setNewHeartbeatInterval] = useState<string>('')
  const [queryVaultOwner, setQueryVaultOwner] = useState<string>('')

  const algodConfig = getAlgodConfigFromViteEnvironment()
  const algorand = AlgorandClient.fromConfig({ algodConfig })

  const { enqueueSnackbar } = useSnackbar()
  const { transactionSigner, activeAddress } = useWallet()

  // Initialize client when appId is set
  useEffect(() => {
    if (appId && !isNaN(Number(appId))) {
      try {
        const newClient = new TrustVaultClient({
          appId: BigInt(Number(appId)),
          algorand: algorand,
        })
        setClient(newClient)
      } catch (error) {
        console.error('Error initializing client:', error)
      }
    }
  }, [appId])

  // Load vault info when client and activeAddress are available
  useEffect(() => {
    if (client && activeAddress) {
      loadVaultInfo(activeAddress)
      loadTotalVaults()
    }
  }, [client, activeAddress])

  const loadVaultInfo = async (vaultOwner: string) => {
    if (!client || !vaultOwner) return

    try {
      const result = await client.send.getVaultInfo({
        args: { vaultOwner },
      })
      if (result.return) {
        const [heir, lastHeartbeat, interval, balance] = result.return
        setVaultInfo({
          heir,
          lastHeartbeat,
          heartbeatInterval: interval,
          vaultBalance: balance,
        })
      }
    } catch (error: any) {
      // Vault might not exist, which is okay
      if (!error.message?.includes('Vault does not exist')) {
        console.error('Error loading vault info:', error)
      } else {
        setVaultInfo(null)
      }
    }
  }

  const loadTotalVaults = async () => {
    if (!client) return

    try {
      const result = await client.send.getTotalVaults()
      if (result.return !== undefined) {
        setTotalVaults(result.return)
      }
    } catch (error) {
      console.error('Error loading total vaults:', error)
    }
  }

  const handleOptIn = async () => {
    if (!client || !activeAddress || !transactionSigner) {
      enqueueSnackbar('Please connect wallet first', { variant: 'warning' })
      return
    }

    setLoading(true)
    try {
      enqueueSnackbar('Opting in to TrustVault...', { variant: 'info' })
      await client.send.optIn.optIn({
        args: [],
        sender: activeAddress,
        signer: transactionSigner,
      })
      enqueueSnackbar('Successfully opted in!', { variant: 'success' })
      await loadVaultInfo(activeAddress)
    } catch (error: any) {
      enqueueSnackbar(`Opt-in failed: ${error.message}`, { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleSetupVault = async () => {
    if (!client || !activeAddress || !transactionSigner) {
      enqueueSnackbar('Please connect wallet first', { variant: 'warning' })
      return
    }

    if (!heirAddress || !heartbeatInterval) {
      enqueueSnackbar('Please fill in all required fields', { variant: 'warning' })
      return
    }

    const interval = BigInt(heartbeatInterval)
    const minInterval = BigInt(7776000) // 3 months in seconds
    const maxInterval = BigInt(31536000) // 1 year in seconds

    if (interval < minInterval || interval > maxInterval) {
      enqueueSnackbar('Heartbeat interval must be between 3 months (7776000s) and 1 year (31536000s)', {
        variant: 'error',
      })
      return
    }

    setLoading(true)
    try {
      enqueueSnackbar('Setting up vault...', { variant: 'info' })
      await client.send.setupVault({
        args: {
          heir: heirAddress,
          heartbeatInterval: interval,
        },
        sender: activeAddress,
        signer: transactionSigner,
      })
      enqueueSnackbar('Vault setup successful!', { variant: 'success' })
      setHeirAddress('')
      setHeartbeatInterval('')
      await loadVaultInfo(activeAddress)
    } catch (error: any) {
      enqueueSnackbar(`Setup failed: ${error.message}`, { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleDepositFunds = async () => {
    // 1. Basic Validation
    if (!client || !activeAddress || !transactionSigner) {
      enqueueSnackbar('Please connect wallet first', { variant: 'warning' })
      return
    }

    if (!depositAmount || Number(depositAmount) <= 0) {
      enqueueSnackbar('Please enter a valid deposit amount', { variant: 'warning' })
      return
    }

    setLoading(true)
    try {
      if (!appId || isNaN(Number(appId))) {
        enqueueSnackbar('Please enter a valid App ID', { variant: 'error' })
        return
      }

      enqueueSnackbar('Depositing funds...', { variant: 'info' })
      const amount = algo(Number(depositAmount))

      // 2. Get App Address
      const appAddress = algosdk.getApplicationAddress(Number(appId))

      if (!appAddress) {
        enqueueSnackbar('Failed to compute app address', { variant: 'error' })
        return
      }

      // 3. Create the Composer
      const composer = client.newGroup()

      // 4. Create the Payment Transaction Object
      const suggestedParams = await algorand.client.algod.getTransactionParams().do()
      const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: activeAddress,
        receiver: appAddress,
        amount: Number(amount),
        suggestedParams: suggestedParams,
      })

      // --- THE FIX STARTS HERE ---

      // 5. Wrap the transaction with the signer
      // This tells the SDK: "Here is the txn, and here is who signs it."
      const paymentTxnWithSigner = {
        txn: paymentTxn,
        signer: transactionSigner,
      }

      // 6. Call the method using the object directly
      // We REMOVED 'composer.addTransaction(...)'
      // The composer will now handle adding the txn to the group automatically.
      composer.depositFunds({
        args: {
          payment: paymentTxnWithSigner, // Pass the object, not an index
        },
        sender: activeAddress,
        signer: transactionSigner,
      })

      // --- THE FIX ENDS HERE ---

      // 7. Send the group
      const result = await composer.send()

      enqueueSnackbar('Deposit successful!', { variant: 'success' })
      setDepositAmount('')
      await loadVaultInfo(activeAddress)
    } catch (error: any) {
      console.error(error) // Log full error to console for debugging
      enqueueSnackbar(`Deposit failed: ${error.message}`, { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleWithdrawFunds = async () => {
    if (!client || !activeAddress || !transactionSigner) {
      enqueueSnackbar('Please connect wallet first', { variant: 'warning' })
      return
    }

    if (!withdrawAmount || Number(withdrawAmount) <= 0) {
      enqueueSnackbar('Please enter a valid withdrawal amount', { variant: 'warning' })
      return
    }

    setLoading(true)
    try {
      enqueueSnackbar('Withdrawing funds...', { variant: 'info' })

      // 1. Conversion: User Input -> MicroAlgos (BigInt)
      const amountInMicroAlgos = BigInt(Math.round(Number(withdrawAmount) * 1_000_000))

      // 2. Create Composer
      const composer = client.newGroup()

      // 3. Add Method Call with Correct Fee Logic
      composer.withdrawFunds({
        args: {
          amount: amountInMicroAlgos,
        },
        sender: activeAddress,
        signer: transactionSigner,

        // FIX: Use 'fee' directly instead of 'suggestedParams'
        // The generated client expects 'AlgoAmount' here.
        // We use your 'algo' helper to create 2000 microAlgos (0.002 ALGO)
        // If 'algo' expects ALGO units: 0.002 ALGO = 2000 microAlgos
        staticFee: algo(0.002),
      })

      // 4. Send
      await composer.send()

      enqueueSnackbar('Withdrawal successful!', { variant: 'success' })
      setWithdrawAmount('')
      await loadVaultInfo(activeAddress)
    } catch (error: any) {
      console.error(error)
      enqueueSnackbar(`Withdrawal failed: ${error.message}`, { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateHeir = async () => {
    if (!client || !activeAddress || !transactionSigner) {
      enqueueSnackbar('Please connect wallet first', { variant: 'warning' })
      return
    }

    if (!newHeirAddress) {
      enqueueSnackbar('Please enter a new heir address', { variant: 'warning' })
      return
    }

    setLoading(true)
    try {
      enqueueSnackbar('Updating heir...', { variant: 'info' })
      await client.send.updateHeir({
        args: {
          newHeir: newHeirAddress,
        },
        sender: activeAddress,
        signer: transactionSigner,
      })
      enqueueSnackbar('Heir updated successfully!', { variant: 'success' })
      setNewHeirAddress('')
      await loadVaultInfo(activeAddress)
    } catch (error: any) {
      enqueueSnackbar(`Update failed: ${error.message}`, { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateHeartbeatInterval = async () => {
    if (!client || !activeAddress || !transactionSigner) {
      enqueueSnackbar('Please connect wallet first', { variant: 'warning' })
      return
    }

    if (!newHeartbeatInterval) {
      enqueueSnackbar('Please enter a new heartbeat interval', { variant: 'warning' })
      return
    }

    const interval = BigInt(newHeartbeatInterval)
    const minInterval = BigInt(7776000) // 3 months
    const maxInterval = BigInt(31536000) // 1 year

    if (interval < minInterval || interval > maxInterval) {
      enqueueSnackbar('Heartbeat interval must be between 3 months (7776000s) and 1 year (31536000s)', {
        variant: 'error',
      })
      return
    }

    setLoading(true)
    try {
      enqueueSnackbar('Updating heartbeat interval...', { variant: 'info' })
      await client.send.updateHeartbeatInterval({
        args: {
          newInterval: interval,
        },
        sender: activeAddress,
        signer: transactionSigner,
      })
      enqueueSnackbar('Heartbeat interval updated successfully!', { variant: 'success' })
      setNewHeartbeatInterval('')
      await loadVaultInfo(activeAddress)
    } catch (error: any) {
      enqueueSnackbar(`Update failed: ${error.message}`, { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleHeartbeat = async () => {
    if (!client || !activeAddress || !transactionSigner) {
      enqueueSnackbar('Please connect wallet first', { variant: 'warning' })
      return
    }

    setLoading(true)
    try {
      enqueueSnackbar('Sending heartbeat...', { variant: 'info' })
      await client.send.heartbeat({
        args: [],
        sender: activeAddress,
        signer: transactionSigner,
      })
      enqueueSnackbar('Heartbeat sent successfully!', { variant: 'success' })
      await loadVaultInfo(activeAddress)
    } catch (error: any) {
      enqueueSnackbar(`Heartbeat failed: ${error.message}`, { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleClaimFunds = async () => {
    if (!client || !activeAddress || !transactionSigner) {
      enqueueSnackbar('Please connect wallet first', { variant: 'warning' })
      return
    }

    if (!claimVaultOwner) {
      enqueueSnackbar('Please enter the vault owner address', { variant: 'warning' })
      return
    }

    setLoading(true)
    try {
      enqueueSnackbar('Claiming funds...', { variant: 'info' })
      await client.send.claimFunds({
        args: {
          vaultOwner: claimVaultOwner,
        },
        sender: activeAddress,
        signer: transactionSigner,
      })
      enqueueSnackbar('Funds claimed successfully!', { variant: 'success' })
      setClaimVaultOwner('')
      await loadVaultInfo(claimVaultOwner)
      await loadTotalVaults()
    } catch (error: any) {
      enqueueSnackbar(`Claim failed: ${error.message}`, { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleQueryVault = async () => {
    if (!client || !queryVaultOwner) {
      enqueueSnackbar('Please enter a vault owner address', { variant: 'warning' })
      return
    }

    setLoading(true)
    try {
      await loadVaultInfo(queryVaultOwner)
      enqueueSnackbar('Vault info loaded', { variant: 'success' })
    } catch (error: any) {
      enqueueSnackbar(`Query failed: ${error.message}`, { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const formatTimestamp = (timestamp: bigint): string => {
    if (timestamp === BigInt(0)) return 'Never'
    const date = new Date(Number(timestamp) * 1000)
    return date.toLocaleString()
  }

  const formatInterval = (interval: bigint): string => {
    const seconds = Number(interval)
    const days = Math.floor(seconds / 86400)
    const months = Math.floor(days / 30)
    if (months >= 1) {
      return `${months} month${months > 1 ? 's' : ''}`
    }
    return `${days} day${days > 1 ? 's' : ''}`
  }

  return (
    <div className="min-h-screen w-full bg-[#0a0f1c] font-['Outfit'] text-[#d8f5f2] relative overflow-hidden">
      {/* 1. Add Font & Custom CSS Variables */}
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet" />
      <style>{`
      :root {
        --teal: #03c6b8;
        --cyan: #00aaff;
        --text: #d8f5f2;
        --muted: #9fd5d0;
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
      .btn-glow:hover:not(:disabled) {
        box-shadow: 0 0 20px rgba(3, 198, 184, 0.4);
        transform: translateY(-2px);
      }
      .btn-glow:disabled {
        background: #1f2937;
        color: #4b5563;
      }
      .input-dark {
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(3, 198, 184, 0.3);
        color: var(--text);
      }
      .input-dark:focus {
        border-color: var(--cyan);
        outline: none;
        box-shadow: 0 0 0 2px rgba(0, 170, 255, 0.2);
      }
    `}</style>

      {/* Background Decorations */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[#03c6b8] opacity-[0.05] blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[#00aaff] opacity-[0.05] blur-[100px] pointer-events-none"></div>

      <div className="max-w-4xl mx-auto p-6 space-y-8 relative z-10">
        {/* Header Section */}
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-5xl font-bold gradient-text tracking-tight mb-2">TrustVault 🛡️</h1>
          <p className="text-[#9fd5d0] text-lg">Secure your legacy on Algorand.</p>

          {/* Account Component Wrapper */}
          <div className="mt-6 flex justify-center">
            <Account />
          </div>
        </div>

        {/* Stats Bar (Replaces Configuration Card) */}
        <div className="glass-card rounded-2xl p-6 flex flex-wrap justify-between items-center gap-4">
          <div>
            <p className="text-[#9fd5d0] text-sm uppercase tracking-wider">Active Vaults</p>
            <p className="text-3xl font-bold text-white">{totalVaults !== null ? totalVaults.toString() : '-'}</p>
          </div>
          <div className="text-right">
            <p className="text-[#9fd5d0] text-sm uppercase tracking-wider">Network</p>
            <p className="text-xl font-bold text-[#00aaff]">Testnet</p>
          </div>
        </div>

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Column 1: Vault Management */}
          <div className="space-y-6">
            {/* Vault Info Card */}
            {vaultInfo ? (
              <div className="glass-card rounded-2xl p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <svg className="w-24 h-24 text-[#03c6b8]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-4 border-b border-[#03c6b8]/20 pb-2">Your Vault</h2>
                <div className="space-y-4">
                  <div>
                    <p className="text-[#9fd5d0] text-xs uppercase">Heir Address</p>
                    <p className="font-mono text-sm truncate text-white">{vaultInfo.heir}</p>
                  </div>
                  <div>
                    <p className="text-[#9fd5d0] text-xs uppercase">Balance</p>
                    <p className="text-3xl font-bold text-[#03c6b8]">
                      {Number(vaultInfo.vaultBalance) / 1e6} <span className="text-sm text-white">ALGO</span>
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[#9fd5d0] text-xs uppercase">Interval</p>
                      <p className="text-white">{formatInterval(vaultInfo.heartbeatInterval)}</p>
                    </div>
                    <div>
                      <p className="text-[#9fd5d0] text-xs uppercase">Last Heartbeat</p>
                      <p className="text-white">{formatTimestamp(vaultInfo.lastHeartbeat)}</p>
                    </div>
                  </div>
                </div>

                {/* Heartbeat Action embedded in Info Card */}
                <div className="mt-6 pt-4 border-t border-[#03c6b8]/20">
                  <button
                    className="btn-glow w-full py-3 rounded-xl font-bold shadow-lg"
                    onClick={handleHeartbeat}
                    disabled={loading || !client || !activeAddress}
                  >
                    {loading ? 'Processing...' : '💓 Send Heartbeat'}
                  </button>
                </div>
              </div>
            ) : (
              // OPT IN CALL TO ACTION (Shown if no vault info)
              <div className="glass-card rounded-2xl p-8 text-center border-dashed border-2 border-[#03c6b8]/40">
                <h2 className="text-2xl font-bold text-white mb-2">No Vault Found</h2>
                <p className="text-[#9fd5d0] mb-6">Create your digital will on the blockchain today.</p>
                <button
                  className="btn-glow px-8 py-3 rounded-xl w-full"
                  onClick={handleOptIn}
                  disabled={loading || !client || !activeAddress}
                >
                  {loading ? 'Creating...' : 'Initialize Vault (Opt In)'}
                </button>
              </div>
            )}

            {/* Financial Actions */}
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Manage Funds</h2>
              <div className="space-y-4">
                {/* Deposit */}
                <div className="form-control">
                  <label className="label text-xs uppercase text-[#9fd5d0]">Deposit (ALGO)</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="0.00"
                      className="input input-bordered input-dark w-full rounded-lg px-4"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                    />
                    <button
                      className="btn-glow px-6 rounded-lg whitespace-nowrap"
                      onClick={handleDepositFunds}
                      disabled={loading || !client || !activeAddress}
                    >
                      Deposit
                    </button>
                  </div>
                </div>

                {/* Withdraw */}
                <div className="form-control pt-2">
                  <label className="label text-xs uppercase text-[#9fd5d0]">Withdraw (ALGO)</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="0.00"
                      className="input input-bordered input-dark w-full rounded-lg px-4"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                    />
                    <button
                      className="btn-glow px-6 rounded-lg whitespace-nowrap"
                      onClick={handleWithdrawFunds}
                      disabled={loading || !client || !activeAddress}
                    >
                      Withdraw
                    </button>
                  </div>
                </div>

                {/* Heartbeat Section */}
                <div className="glass-card rounded-2xl p-6 mt-6">
                  <h2 className="text-xl font-semibold text-white mb-2">Send Heartbeat</h2>
                  <p className="text-[#9fd5d0] text-sm mb-4">Update your last heartbeat timestamp to reset the inactivity timer.</p>
                  <button
                    className="btn-glow w-full py-3 rounded-xl font-bold shadow-lg"
                    onClick={handleHeartbeat}
                    disabled={loading || !client || !activeAddress}
                  >
                    {loading ? <span className="loading loading-spinner" /> : 'Send Heartbeat'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Configuration & Heir Actions */}
          <div className="space-y-6">
            {/* Setup / Config Vault */}
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Configuration</h2>

              {/* Initial Setup */}
              <div className="mb-6 pb-6 border-b border-[#03c6b8]/10">
                <p className="text-[#9fd5d0] text-sm mb-4">Setup Heir & Timer</p>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Heir Address"
                    className="input input-bordered input-dark w-full rounded-lg px-4 py-2"
                    value={heirAddress}
                    onChange={(e) => setHeirAddress(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Interval (sec) e.g. 31536000"
                    className="input input-bordered input-dark w-full rounded-lg px-4 py-2"
                    value={heartbeatInterval}
                    onChange={(e) => setHeartbeatInterval(e.target.value)}
                  />
                  <button
                    className="btn-glow w-full py-2 rounded-lg mt-2"
                    onClick={handleSetupVault}
                    disabled={loading || !client || !activeAddress}
                  >
                    Setup New Vault
                  </button>
                </div>
              </div>

              {/* Updates */}
              <div className="space-y-4">
                <p className="text-[#9fd5d0] text-sm">Update Existing Settings</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="New Heir Address"
                    className="input input-bordered input-dark w-full rounded-lg px-3 text-sm"
                    value={newHeirAddress}
                    onChange={(e) => setNewHeirAddress(e.target.value)}
                  />
                  <button
                    className="px-4 py-2 rounded-lg border border-[#03c6b8] text-[#03c6b8] hover:bg-[#03c6b8] hover:text-[#000] transition-colors text-sm font-semibold"
                    onClick={handleUpdateHeir}
                    disabled={loading}
                  >
                    Update
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="New Interval"
                    className="input input-bordered input-dark w-full rounded-lg px-3 text-sm"
                    value={newHeartbeatInterval}
                    onChange={(e) => setNewHeartbeatInterval(e.target.value)}
                  />
                  <button
                    className="px-4 py-2 rounded-lg border border-[#03c6b8] text-[#03c6b8] hover:bg-[#03c6b8] hover:text-[#000] transition-colors text-sm font-semibold"
                    onClick={handleUpdateHeartbeatInterval}
                    disabled={loading}
                  >
                    Update
                  </button>
                </div>
              </div>
            </div>

            {/* External Actions (Query / Claim) */}
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4">External Actions</h2>

              <div className="space-y-6">
                <div>
                  <label className="label text-xs uppercase text-[#9fd5d0]">Query Any Vault</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Owner Address"
                      className="input input-bordered input-dark w-full rounded-lg px-4"
                      value={queryVaultOwner}
                      onChange={(e) => setQueryVaultOwner(e.target.value)}
                    />
                    <button
                      className="px-4 py-2 rounded-lg bg-[#1f2937] text-white hover:bg-[#374151] border border-gray-600"
                      onClick={handleQueryVault}
                      disabled={loading}
                    >
                      🔍
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#03c6b8]/10">
                  <label className="label text-xs uppercase text-[#00aaff] font-bold">Heir Claim</label>
                  <p className="text-xs text-[#9fd5d0] mb-2">Claim funds if owner is inactive.</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Inactive Vault Address"
                      className="input input-bordered input-dark w-full rounded-lg px-4"
                      value={claimVaultOwner}
                      onChange={(e) => setClaimVaultOwner(e.target.value)}
                    />
                    <button
                      className="btn-glow px-4 rounded-lg whitespace-nowrap bg-gradient-to-r from-red-500 to-orange-500 text-white"
                      style={{ background: 'linear-gradient(135deg, #ff5f6d, #ffc371)', color: 'white' }}
                      onClick={handleClaimFunds}
                      disabled={loading}
                    >
                      Claim
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TrustVaultInterface
