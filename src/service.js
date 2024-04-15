const path = require('path');
const fs = require('fs').promises;
const { ethers} = require("ethers");
const { getLogger } = require('./logUtil');
const { getCollection } = require('./dbUtil');
const { createXterapiInstance } = require('./api');
const { createChainApi, transfer, getProvider } = require('./chain');

const logger = getLogger('service');
// 存邀请码
const activateCodeCollection = getCollection('activateCode');

const needPostTaskIds = [17, 13, 14, 18];
let chatTextList = [];
let chatTextIndex = 0;
chatTextIndex += 1

class Service {
    constructor(account) {
        this.account = account;
        this.address = account.address;
        this.api = null;
    }
    async init() {
        this.log(`init`);
        this.api = await createXterapiInstance(this.account);
        this.chainApi = await createChainApi(this.account);
        const signMessage = await this.api.getSignMessage();
        // this.log(`Get SignMessage: ${JSON.stringify(signMessage)}`);
        const tokenInfo = await this.api.postWallet(signMessage);
        // this.log(`Get TokenInfo: ${JSON.stringify(tokenInfo)}`);

    }
    async claimEgg() {
        let claimed = await this.chainApi.eggClaimed();
        if (claimed) {
            this.log(`has already claimed`);
        } else {
            this.log(`Begin Claim Egg`);
            await this.chainApi.claimEgg();
        }
    }
    async setActivateCode() {
        const inviteCode = await this.api.inviteCode();
        const {activate_code, code} = inviteCode;
        // this.log(`Get InviteCode: ${JSON.stringify(inviteCode)}`);
        // 存储自身的邀请码
        await this.insertActivateCode(code);
        if (activate_code === '') {
            // 填入别人的邀请码
            const activateCode = await this.getActivateCode();
            logger.info(`${this.address} 没有设置邀请码, 设置邀请码: ${activateCode}`)
            await this.api.apply(activateCode);
        } else {
            this.log(`已经设置过邀请码了: ${activate_code}`);
        }
    }
    async mintChatNft() {
        const now = parseInt(Date.now() / 1000);
        let config = await this.api.getConfig();
        const stageList = config.list || [];
        const stage = stageList.filter(s => {
            return now >= s.start && now <= s.end;
        })[0]
        this.log(`now stage: ${JSON.stringify(stage)}`);
        const stageIndex = stage.index - 1;
        let hasMintList = await this.chainApi.checkChatNFTClaimStatusBatch();
        let minted = hasMintList[stageIndex];
        this.log(`ChatNft Mint status: ${minted}`);
        if (minted === true) {
            return
        }
        let { max_score, retry} = await this.api.chat();
        // 答题
        for(let i = retry; i < 4; i++) {
            if (max_score >= 91) {
                break;
            }
            this.log(`max_score=${max_score}, retry=${retry}`);
            let answer = await this.getChatAnswer(stage.name);
            this.log(`Answer=${answer}`);
            await this.api.talk(answer);
            let chat = await this.api.chat();
            max_score = chat.max_score;
            retry = chat.retry;
        }
        this.log(`chat max_score=${max_score}, begin mint chatNFT`);
        await this.chainApi.claimChatNFT();

    }
    async growthPoint() {
        let statusList = await this.chainApi.claimedUtilitiesTodayBatch();
        for(let i in statusList) {
            i = parseInt(i)
            const claimedNum = statusList[i];
            if (claimedNum.eq(ethers.utils.parseEther('0'))) {
                this.log(`没有Mint: ${i+1} 道具，开始Mint`);
                await this.chainApi.claimUtility(i + 1);
            }
        }
        await this.chainApi.claimedUtilitiesTodayBatch();
        const incubation = await this.api.incubation();
        for(let prop of incubation.props) {
            let total = prop.total;
            let cons_total = prop.cons_total;
            if (total > cons_total) {
                this.log(`投喂道具: ${prop.props_id}`)
                await this.api.prop(prop.props_id);
            }
        }
    }

    async finishTask() {
        const {list:taskList} = await this.api.task();
        for(let task of taskList) {
            let taskId = task.ID;
            let config = JSON.parse(task.config);
            let userTask = task.user_task || [];
            if (needPostTaskIds.includes(taskId)) {
                for(let index in config) {
                    let subResult = userTask[index];
                    if (!subResult) {
                        await this.api.taskReport(taskId);
                        await this.api.postTask(taskId);
                        continue
                    }
                    if (subResult.status === 1) {
                        // 已完成，未领取
                        await this.api.postTask(taskId);
                    }
                }
            } else {
                for(let index in config) {
                    let subResult = userTask[index];
                    if (!subResult) continue;
                    if (subResult.status === 1) {
                        await this.api.postTask(taskId);
                    }
                }
            }
        }
    }
    async summary() {
        const { boost, point, rank, invited_num} = await this.api.point();
        const {total_ticket} = await this.api.ticket();
        this.log(`boost=${boost.map(p=>p.value+'').join('+')}, point=${point.map(p=>p.value+'').join(' + ')}, rank=${rank}, invitedNum=${invited_num}, ticket=${total_ticket}`);
    }
    async getChatAnswer(name) {
        if (chatTextList.length === 0) {
            await this.initChatTextList(name);
        }
        const answer = chatTextList[chatTextIndex];
        chatTextIndex ++;
        return answer;
    }
    async initChatTextList(name) {
        const filePath = path.join(__dirname, `../files/xter-${name}-text.txt`);
        let lines = await fs.readFile(filePath);
        lines = lines.toString().split('\n').map((line) => {
            return line.trim()
        }).filter(line => {
            return line !== ''
        })
        chatTextList = lines;
        chatTextIndex = 0;
    }
    async insertActivateCode(code) {
        let codeObj = await activateCodeCollection.findOneAsync({activateCode: code});
        if (codeObj) {
            return
        }
        // 新建历史记录
        let obj = {
            activateCode: code,
            address: this.address,
            useCount: 0,
        }
        await activateCodeCollection.insertAsync(obj);
    }
    async getActivateCode() {
        // 找到使用次数最接近50的邀请码
        let codeList = await activateCodeCollection.findAsync({ useCount: {$lt: 50}});
        codeList = codeList.sort((a, b) => b.useCount - a.useCount);
        return codeList[0].activateCode;
    }
    log(message) {
        logger.info(`${this.address} ${message}`);
    }

}

module.exports = {
    Service
}
