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
  const [appId, setAppId] = useState<string>('')
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

      // Get app address from appId
      const appAddress = algosdk.getApplicationAddress(Number(appId))
      
      if (!appAddress) {
        enqueueSnackbar('Failed to compute app address', { variant: 'error' })
        return
      }

      // Use the composer to create a transaction group with payment and deposit
      const composer = client.newGroup()
      
      // Create payment transaction without sending it
      const suggestedParams = await algorand.client.algod.getTransactionParams().do()
      const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: activeAddress,
        receiver: appAddress,
        amount: Number(amount),
        suggestedParams: suggestedParams,
      })
      
      // Add payment transaction first (index 0)
      composer.addTransaction(paymentTxn, transactionSigner)
      
      // Add deposit_funds call - payment is at index 0
      // The payment argument should reference the transaction index
      // Note: sender is required for the app call transaction
      composer.depositFunds({
        args: {
          payment: { txnIndex: 0 } as any, // Reference to transaction at index 0
        },
        sender: activeAddress,
        signer: transactionSigner,
      })

      // Send the transaction group - signer is already provided when adding transactions
      const result = await composer.send()

      enqueueSnackbar('Deposit successful!', { variant: 'success' })
      setDepositAmount('')
      await loadVaultInfo(activeAddress)
    } catch (error: any) {
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
      await client.send.withdrawFunds({
        args: {
          amount: BigInt(withdrawAmount),
        },
        sender: activeAddress,
        signer: transactionSigner,
      })
      enqueueSnackbar('Withdrawal successful!', { variant: 'success' })
      setWithdrawAmount('')
      await loadVaultInfo(activeAddress)
    } catch (error: any) {
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
    <div className="w-full max-w-4xl mx-auto p-4 space-y-6">
      <Account />

      {/* App ID Configuration */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">TrustVault Configuration</h2>
          <div className="form-control">
            <label className="label">
              <span className="label-text">Application ID</span>
            </label>
            <input
              type="text"
              placeholder="Enter TrustVault App ID"
              className="input input-bordered w-full"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
            />
          </div>
          {totalVaults !== null && (
            <div className="mt-2">
              <p className="text-sm">Total Active Vaults: {totalVaults.toString()}</p>
            </div>
          )}
        </div>
      </div>

      {/* Vault Information */}
      {vaultInfo && (
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Your Vault Information</h2>
            <div className="space-y-2">
              <p>
                <strong>Heir Address:</strong> {vaultInfo.heir}
              </p>
              <p>
                <strong>Vault Balance:</strong> {Number(vaultInfo.vaultBalance) / 1e6} ALGO
              </p>
              <p>
                <strong>Heartbeat Interval:</strong> {formatInterval(vaultInfo.heartbeatInterval)}
              </p>
              <p>
                <strong>Last Heartbeat:</strong> {formatTimestamp(vaultInfo.lastHeartbeat)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Query Vault */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Query Vault</h2>
          <div className="form-control">
            <input
              type="text"
              placeholder="Enter vault owner address"
              className="input input-bordered w-full"
              value={queryVaultOwner}
              onChange={(e) => setQueryVaultOwner(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary mt-2"
            onClick={handleQueryVault}
            disabled={loading || !client || !queryVaultOwner}
          >
            {loading ? <span className="loading loading-spinner" /> : 'Query Vault'}
          </button>
        </div>
      </div>

      {/* Opt In */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Opt In</h2>
          <p className="text-sm text-gray-500 mb-4">Opt in to the TrustVault application to create your vault.</p>
          <button
            className="btn btn-primary"
            onClick={handleOptIn}
            disabled={loading || !client || !activeAddress}
          >
            {loading ? <span className="loading loading-spinner" /> : 'Opt In'}
          </button>
        </div>
      </div>

      {/* Setup Vault */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Setup Vault</h2>
          <p className="text-sm text-gray-500 mb-4">
            Set up your vault with an heir address and heartbeat interval (3 months to 1 year).
          </p>
          <div className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text">Heir Address</span>
              </label>
              <input
                type="text"
                placeholder="Enter heir address"
                className="input input-bordered w-full"
                value={heirAddress}
                onChange={(e) => setHeirAddress(e.target.value)}
              />
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text">Heartbeat Interval (seconds)</span>
              </label>
              <input
                type="text"
                placeholder="e.g., 7776000 (3 months) or 31536000 (1 year)"
                className="input input-bordered w-full"
                value={heartbeatInterval}
                onChange={(e) => setHeartbeatInterval(e.target.value)}
              />
              <label className="label">
                <span className="label-text-alt">Range: 7776000 (3 months) to 31536000 (1 year)</span>
              </label>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleSetupVault}
              disabled={loading || !client || !activeAddress || !heirAddress || !heartbeatInterval}
            >
              {loading ? <span className="loading loading-spinner" /> : 'Setup Vault'}
            </button>
          </div>
        </div>
      </div>

      {/* Deposit Funds */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Deposit Funds</h2>
          <div className="form-control">
            <label className="label">
              <span className="label-text">Amount (ALGO)</span>
            </label>
            <input
              type="text"
              placeholder="Enter amount to deposit"
              className="input input-bordered w-full"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary mt-2"
            onClick={handleDepositFunds}
            disabled={loading || !client || !activeAddress || !depositAmount}
          >
            {loading ? <span className="loading loading-spinner" /> : 'Deposit Funds'}
          </button>
        </div>
      </div>

      {/* Withdraw Funds */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Withdraw Funds</h2>
          <div className="form-control">
            <label className="label">
              <span className="label-text">Amount (microALGO)</span>
            </label>
            <input
              type="text"
              placeholder="Enter amount to withdraw"
              className="input input-bordered w-full"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary mt-2"
            onClick={handleWithdrawFunds}
            disabled={loading || !client || !activeAddress || !withdrawAmount}
          >
            {loading ? <span className="loading loading-spinner" /> : 'Withdraw Funds'}
          </button>
        </div>
      </div>

      {/* Update Heir */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Update Heir</h2>
          <div className="form-control">
            <label className="label">
              <span className="label-text">New Heir Address</span>
            </label>
            <input
              type="text"
              placeholder="Enter new heir address"
              className="input input-bordered w-full"
              value={newHeirAddress}
              onChange={(e) => setNewHeirAddress(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary mt-2"
            onClick={handleUpdateHeir}
            disabled={loading || !client || !activeAddress || !newHeirAddress}
          >
            {loading ? <span className="loading loading-spinner" /> : 'Update Heir'}
          </button>
        </div>
      </div>

      {/* Update Heartbeat Interval */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Update Heartbeat Interval</h2>
          <div className="form-control">
            <label className="label">
              <span className="label-text">New Heartbeat Interval (seconds)</span>
            </label>
            <input
              type="text"
              placeholder="e.g., 7776000 (3 months) or 31536000 (1 year)"
              className="input input-bordered w-full"
              value={newHeartbeatInterval}
              onChange={(e) => setNewHeartbeatInterval(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary mt-2"
            onClick={handleUpdateHeartbeatInterval}
            disabled={loading || !client || !activeAddress || !newHeartbeatInterval}
          >
            {loading ? <span className="loading loading-spinner" /> : 'Update Interval'}
          </button>
        </div>
      </div>

      {/* Heartbeat */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Send Heartbeat</h2>
          <p className="text-sm text-gray-500 mb-4">Update your last heartbeat timestamp to reset the inactivity timer.</p>
          <button
            className="btn btn-primary"
            onClick={handleHeartbeat}
            disabled={loading || !client || !activeAddress}
          >
            {loading ? <span className="loading loading-spinner" /> : 'Send Heartbeat'}
          </button>
        </div>
      </div>

      {/* Claim Funds */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Claim Funds (Heir Only)</h2>
          <p className="text-sm text-gray-500 mb-4">
            Claim funds from a vault if the vault owner has been inactive beyond the heartbeat interval.
          </p>
          <div className="form-control">
            <label className="label">
              <span className="label-text">Vault Owner Address</span>
            </label>
            <input
              type="text"
              placeholder="Enter vault owner address"
              className="input input-bordered w-full"
              value={claimVaultOwner}
              onChange={(e) => setClaimVaultOwner(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary mt-2"
            onClick={handleClaimFunds}
            disabled={loading || !client || !activeAddress || !claimVaultOwner}
          >
            {loading ? <span className="loading loading-spinner" /> : 'Claim Funds'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default TrustVaultInterface
