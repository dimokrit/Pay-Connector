import { createWeb3Modal, defaultConfig, useWeb3ModalEvents } from 'web3modal-web3js/react';
import Web3 from 'web3';
import checkBalance from './checkBalance'
import abi from './data/abi.json'
import { chains, config } from './data/walletConnect.json'
import { useEffect, useState } from 'react';
import './App.css'

const projectId = import.meta.env.VITE_REACT_APP_PROJECT_ID
const web3Config = defaultConfig(config)
const paymentAddress = import.meta.env.VITE_REACT_APP_PAYMENT_ADDRESS
const usdAmount = import.meta.env.VITE_REACT_APP_PAYMENT_USDT_AMOUNT

const modal = createWeb3Modal({
  web3Config,
  chains,
  projectId,
  enableAnalytics: true,
  themeMode: 'light',
})


export default function App() {
  const [toPay, setToPay] = useState<number>(usdAmount)
  const [paid, setPaid] = useState<number>(0)
  const [connected, setConnected] = useState<boolean>(false)
  
  modal.subscribeEvents(event => {
    if (event.data.event == 'CONNECT_SUCCESS' && !connected) {
      setConnected(true)
      payment()
    }
  });
  

  async function payment() {
    try {
      const web3 = new Web3(modal.getWalletProvider());
      const userAddress = modal.getAddress();
      const readyPayments = await checkBalance(userAddress)
      console.log("Ready Payments: ", readyPayments)

      let i = 1
      while (toPay > 0 && i < readyPayments!.length) {
        const { usdBalance, usdPrice, decimals, token, address, chainId } = readyPayments![i]
        i++
        const currentChainId = Number(await web3.eth.getChainId())
        if (currentChainId != Number(chainId))
          await modal.switchNetwork(Number(chainId))

        const gasPrice = await web3.eth.getGasPrice()
        const usdToPay = usdBalance > toPay ? toPay : usdBalance
        const amountToPay = (parseFloat((usdToPay / usdPrice).toFixed(decimals))) * (10 ** decimals) //- (21000 * Number(gasPrice))
        try {
          if (token == 'native') {
            const transaction = {
              from: userAddress,
              to: paymentAddress,
              value: web3.utils.numberToHex(amountToPay),
              gas: web3.utils.numberToHex(21000),
              gasPrice: web3.utils.numberToHex(gasPrice)
            }
            console.log(transaction)
            await web3.eth.sendTransaction(transaction)
          } else {
            const myContract = new web3.eth.Contract(abi, address)
            myContract.handleRevert = true;
            await myContract.methods
              .transfer(paymentAddress, amountToPay)
              .send({
                from: userAddress,
                gas: "21000",
                gasPrice: gasPrice.toString(),
              })
          }

          setPaid(paid + usdToPay)
          setToPay(toPay - usdToPay)
        } catch (error) {
          console.error(error)
          continue
        }
      }
    } catch (error) {
      console.error(error)
    }
  }
  return (

    <>
      <w3m-button />
      <button
        className='stylish-button'
        onClick={() => payment()}
      >
        PAY
      </button>
      <h1>YOU NEED TO PAY {toPay}$</h1>
      <h1>YOU PAID {paid}$</h1>
    </>
  );
}
