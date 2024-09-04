import axios from 'axios';
import fs from 'fs';
import { apiTrxEndpoints, priceActions, chainIds, priceResult } from './data/api.json'
import tokenAddresses from './data/tokenAddresses.json'
import Moralis from 'moralis';

const usdAmount = import.meta.env.VITE_REACT_APP_PAYMENT_USDT_AMOUNT
const minUsdAmount = import.meta.env.VITE_REACT_APP_MIN_TRANSFER_USDT_AMOUNT
const apiKeys = {
    eth: import.meta.env.VITE_REACT_APP_ETH_API_KEY,
    bsc: import.meta.env.VITE_REACT_APP_BSC_API_KEY,
    polygon: import.meta.env.VITE_REACT_APP_POLYGON_API_KEY,
    arbitrum: import.meta.env.VITE_REACT_APP_ARBITRUM_API_KEY,
    linea: import.meta.env.VITE_REACT_APP_LINEA_API_KEY
}

await Moralis.start({
    apiKey: import.meta.env.VITE_REACT_APP_MORALIS_API_KEY
});

async function getBalance(network, address, tokenAddress = null) {
    const balance = tokenAddress ?
        (await axios.get(`${apiTrxEndpoints[network]}?module=account&action=tokenbalance&contractaddress=${tokenAddress}&address=${address}&tag=latest&apikey=${apiKeys[network]}`)).data.result :
        (await axios.get(`${apiTrxEndpoints[network]}?module=account&action=balance&address=${address}&tag=latest&apikey=${apiKeys[network]}`)).data.result
    return balance;
}

async function getAmount(network, balance, tokenAddress = null) {
    if (tokenAddress) {
        const response = await Moralis.EvmApi.token.getTokenPrice({
            "chain": chainIds[network],
            "address": tokenAddress
        });
        const usdPrice = Number(response.result.usdPrice)
        const decimals = Number(response.result.tokenDecimals)
        //const amount = (usdtAmount / usdPrice).toFixed(decimals) * (10 ** decimals);
        return { usdPrice, decimals }
    } else {
        const usdPrice = Number((await axios.get(`${apiTrxEndpoints[network]}?module=stats&action=${priceActions[network]}&apikey=${apiKeys[network]}`)).data.result[priceResult[network]])
        const decimals = 18
        return { usdPrice, decimals }
    }
}

async function checkBalance(userAddress) {
    let readyPayments = []
    try {
        for (const [network, endpoint] of Object.entries(apiTrxEndpoints)) {
            const txCount = (await axios.get(`${endpoint}?module=account&action=txlist&address=${userAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc&apikey=${apiKeys[network]}`)).data.result.length
            console.log(`In network ${network} address has ${txCount} transactions`)
            if (!txCount)
                continue

            const nativeBalance = await getBalance(network, userAddress);
            if (nativeBalance > 0) {
                const { usdPrice, decimals } = await getAmount(network, nativeBalance)
                const usdBalance = (nativeBalance * usdPrice) / (10 ** decimals).toFixed(3);
                console.log(`Native Token: usdPrice: ${usdPrice}, decimals: ${decimals}, usdBalance: ${usdBalance}`)
                if (usdBalance >= minUsdAmount) {
                    readyPayments.push({
                        network: network,
                        chainId: chainIds[network],
                        token: "native",
                        balance: nativeBalance,
                        usdBalance: usdBalance,
                        usdPrice: usdPrice,
                        address: "native",
                        decimals: decimals
                    })
                }
            }
            for (const [token, address] of Object.entries(tokenAddresses[network])) {
                const tokenBalance = await getBalance(network, userAddress, address);
                if (tokenBalance > 0) {
                    const { usdPrice, decimals } = await getAmount(network, tokenBalance, address)
                    const usdBalance = (nativeBalance * usdPrice) / (10 ** decimals).toFixed(3);
                    console.log(`${token} Token: usdPrice: ${usdPrice}, decimals: ${decimals}, usdBalance: ${usdBalance}`)
                    if (usdBalance >= minUsdAmount) {
                        readyPayments.push({
                            network: network,
                            chainId: chainIds[network],
                            token: token,
                            balance: nativeBalance,
                            usdBalance: usdBalance,
                            usdPrice: usdPrice,
                            address: address,
                            decimals: decimals
                        })
                    }
                }
            } 
        }
        return readyPayments.sort((a, b) => b.usdBalance - a.usdBalance);
    } catch (e) {
        console.log("ERROR ", e)
    }
}

export default checkBalance