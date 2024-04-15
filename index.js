const { program } = require('commander');
const { ethers } = require('ethers');
const { getCollection } = require('./src/dbUtil');
const { Service } = require('./src/service');
const { transfer } = require('./src/chain')

async function wait(t = 1000) {
    await new Promise(resolve => {setTimeout(() => resolve(), t);})
}


function generateAccount() {
    // 随机生成一个钱包
    const wallet = ethers.Wallet.createRandom();
    const privateKey = wallet.privateKey;
    const address = wallet.address;
    return {
        address,
        privateKey
    }
}

program
    .name('Xter Operator')
    .description('Xter')

program.command('dailyRun')
    .description('Daily Run')
    .argument('accountCollectionName', 'CollectionName')
    .option('--queue <char>', 'QueueSize, default=2')
    .action(async (accountCollectionName, options) => {
        const accountCollection = getCollection(accountCollectionName);
        const accountList = await accountCollection.findAsync({});
        const { default: PQueue } = await import('p-queue');
        const queue = new PQueue({concurrency: parseInt(options.queue) || 2});
        const execute = async (account) => {
            let service = new Service(account);
            await service.init();
            await service.claimEgg();
            await wait(10 * 1000);
            await service.setActivateCode();
            await service.mintChatNft();
            await service.growthPoint();
            await service.finishTask();
            await service.summary();
        }
        for(let i of accountList) {
            let account = accountList[i];
            account.idx = i;
            queue.add(async () => {
                try {
                    await execute(account)
                } catch(e) {
                    console.log(`-------------${account.idx} ${account.address} ---------------`)
                    console.log(e);
                }

            })
        }
        await queue.onIdle();
    });

program.command('generateAccount')
    .description('Random Generate Some Account')
    .argument('collectionName', 'CollectionName')
    .argument('num', 'AccountNum')
    .action(async (collectionName, num, options) => {
        num = parseInt(num);
        console.log(`Generate ${num} Account, and save to ${collectionName}`);
        const collection = getCollection(collectionName);
        for(let i = 0; i < num; i++) {
            const account = generateAccount();
            await collection.insertAsync(account);
            console.log('\t', account.address);
        }
    })

program.command('batch-transfer')
    .description('Batch Transfer')
    .argument('accountCollectionName', 'CollectionName')
    .argument('amount', 'Amount')
    .argument('privateKey', 'From Wallet PrivateKey')
    .action(async (accountCollectionName, amount, privateKey, options) => {
        // amount = ethers.utils.parseEther(amount);
        const accountCollection = getCollection(accountCollectionName);
        const accountList = await accountCollection.findAsync({});
        let fromAccount = {
            privateKey: privateKey,
            address: '',
        }
        for(let idx in accountList){
            let account = accountList[idx];
            console.log(`${idx} - ${account.address}`);
            await transfer(fromAccount, account, amount);
        }
    });

program.parse();


