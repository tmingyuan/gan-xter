const path = require('path');
const { ethers} = require("ethers");
const fs = require('fs').promises;
const { getLogger } = require('./logUtil');

const logger = getLogger('chain');

const providerUrl = 'http://xterio.rpc.huashui.ren/';
const provider = new ethers.providers.JsonRpcProvider(providerUrl, {
    chainId: 112358,
});

async function getAbi(contractAddress) {
    const filePath = path.join(__dirname, 'abi', contractAddress) ;
    const fileContent = await fs.readFile(filePath);
    return JSON.parse(fileContent.toString());
}

async function createChainApi(account) {
    let api = new ChainApi(account);
    await api.init();
    return api;
}

class ChainApi {
    constructor(account) {
        this.account = account;
        this.address = account.address;
        this.wallet = new ethers.Wallet(account.privateKey, provider);
    }
    async init() {
        const contractAddress = '0xBeEDBF1d1908174b4Fc4157aCb128dA4FFa80942'
        const contractAbi = await getAbi(contractAddress);
        this.palloIncubator = new ethers.Contract(contractAddress, contractAbi, this.wallet);
    }

    async claimEgg() {
        const method = 'claimEgg';
        const estimatedGas = await this.palloIncubator.estimateGas[method]({
            value: ethers.utils.parseEther('0'),
        })
        logger.info(`${this.address} Need: ${ethers.utils.formatEther(estimatedGas)} BNB to Claim Egg`)
        const balance = await this.wallet.getBalance();
        if (balance.lt(estimatedGas)) {
            throw new Error(`${this.address} not have enough coin to claim: ${ethers.utils.formatEther(balance)}`);
        }
        const trans = await this.palloIncubator[method]({
            value: ethers.utils.parseEther('0'),
        })
        logger.info(`${this.address} ClaimEgg Trans=${trans.hash}`);
        await trans.wait();
        return trans.hash;
    }

    async eggClaimed() {
        const method = 'eggClaimed';
        const alreadyClaim = await this.palloIncubator[method](this.address);
        logger.info(`${this.address} claimed egg: ${alreadyClaim}`);
        // true claimed, false, not claimed;
        return alreadyClaim;
    }

    async claimUtility(idx) {
        // if ([1,2,3].includes(idx)) {
        //     throw new Error(`${this.address} claimUnility ${idx} error, idx error`);
        // }
        const method = 'claimUtility';
        const needGas = await this.palloIncubator.estimateGas[method](idx);
        const balance = await this.wallet.getBalance();
        if (balance.lt(needGas)) {
            throw new Error(`${this.address} not enough coin to mint ${idx} palio, balance=${ethers.utils.formatEther(balance)}, need=${ethers.utils.formatEther(needGas)}`);
        }
        const trans = await this.palloIncubator[method](idx);
        logger.info(`${this.address} claimUnility ${idx} hash=${trans.hash}`);
        await trans.wait();
        return trans.hash;
    }

    async checkChatNFTClaimStatusBatch() {
        const method = 'checkChatNFTClaimStatusBatch';
        const result = await this.palloIncubator[method](this.address);
        logger.info(`${this.address} ${method} ${result}`);
        return result;
    }
    async claimedUtilitiesTodayBatch() {
        // 查询当日是否能mint 道具？
        const method = 'claimedUtilitiesTodayBatch';
        const result = await this.palloIncubator[method](
            this.address,
            [1,2,3],
        )
        logger.info(`${this.address} ${method} ${result}`);
        return result;
    }
    async claimedUtilitiesToday(idx) {
        const method = 'claimedUtilitiesToday';
        return await this.palloIncubator[method](this.address, idx);
    }
    async claimChatNFT() {
        const method = 'claimChatNFT';
        let balance = await this.wallet.getBalance();
        let needGas = await this.palloIncubator.estimateGas[method]();
        if (balance.lt(needGas)) {
            console.log(`${this.address} Can't ClaimChatNFT, need gas: ${ethers.utils.formatEther(needGas)}, but balance=${ethers.utils.formatEther(balance)}`);
            return null
        }
        const trans = await this.palloIncubator[method]();
        logger.info(`${this.address} claimChatNFT transHash=${trans.hash}`);
        await trans.wait();
        return trans.hash;
    }
    async chatNFTClaimed() {
        const method = 'chatNFTClaimed';
        const result = await this.palloIncubator[method](this.address,)
    }

}

async function transfer(fromAccount, toAccount, amount) {
    logger.info(`${fromAccount.address} trnas ${amount} to ${toAccount.address}`);
    const wallet = new ethers.Wallet(fromAccount.privateKey, provider);
    const amountInWei = ethers.utils.parseEther(amount);
    const gasPrice = await provider.getGasPrice();
    // console.log(gasPrice);
    const transaction = await wallet.sendTransaction({
        to: toAccount.address,
        value: amountInWei,
        // gasPrice: gasPrice.mul(110).div(100)
    });
    logger.info(`${fromAccount.address} TransHash = ${transaction.hash}`);
    await transaction.wait();
    return transaction.hash;
}


module.exports = {
    getAbi,
    ChainApi,
    createChainApi,
    transfer,
}