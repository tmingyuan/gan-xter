const fetch = require('node-fetch');
const { ethers} = require('ethers');
const qs = require('qs');
const { Buffer } = require('buffer');

const { getLogger } = require('./logUtil');

const logger = getLogger('api', {toConsole: false});


function generateDeviceId(address) {
    address = address.toLowerCase();
    return `18eabb${address.slice(0, 8)}-${address.slice(0, 15)}-1c525637-2073600-18eabb${address.slice(0, 8)}`
}

class XterApi {
    constructor(account) {
        this.account = account;
        this.address = account.address;
        this.deviceid = generateDeviceId(this.address);
        this.proxy = null;
        this.access_token = null;
        this.id_token = '';
        this.refresh_token = null;
        this.is_new = null; // 0 = true, 1 = false;
        this.config = null;
    }
    async post(url, body) {
        logger.info(`${this.address} POST: ${url} - ${JSON.stringify(body)}`);
        const resp = await fetch(url, {
            "headers": {
                "accept": "*/*",
                "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
                "authorization": this.id_token,
                "content-type": "application/json",
                "sec-ch-ua": "\"Google Chrome\";v=\"123\", \"Not:A-Brand\";v=\"8\", \"Chromium\";v=\"123\"",
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "\"macOS\"",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-site",
                "sensorsdatajssdkcross": this.getSensorsdata(),
                "Referer": "https://xter.io/",
                "Referrer-Policy": "strict-origin-when-cross-origin"
            },
            "body": JSON.stringify(body),
            "method": "POST"
        });
        const text = await resp.text();
        logger.info(`${this.address} POST Return: ${text}`);
        const respData = JSON.parse(text);
        if (respData.err_code !== 0) {
            throw new Error(`${this.address} Request:POST ${url}-${JSON.stringify(body)} Error: ${text}`);
        }
        return respData.data;
    }
    async get(url, params={}) {
        if (params) {
            url = `${url}?${qs.stringify(params)}`;
        }
        logger.info(`${this.address} GET: ${url} - ${JSON.stringify(params)}`);
        const resp = await fetch(url, {
            "headers": {
                "accept": "*/*",
                "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
                "authorization": this.id_token,
                "content-type": "application/json",
                "sec-ch-ua": "\"Google Chrome\";v=\"123\", \"Not:A-Brand\";v=\"8\", \"Chromium\";v=\"123\"",
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "\"macOS\"",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-site",
                "sensorsdatajssdkcross": this.getSensorsdata(),
                "Referer": "https://xter.io/",
                "Referrer-Policy": "strict-origin-when-cross-origin"
            },
            "body": null,
            "method": "GET"
        });
        const text = await resp.text();
        logger.info(`${this.address} GET Return: ${text}`);
        const respData = JSON.parse(text);
        if (respData.err_code !== 0) {
            throw new Error(`${this.address} Request:GET ${url} Error: ${text}`);
        }
        return respData.data;
    }

    getSensorsdata() {
        let identitiesStr = {"$identity_cookie_id":this.deviceid};
        const buffer = Buffer.from(JSON.stringify(identitiesStr), 'utf-8');
        const base64String = buffer.toString('base64');
        let data = {
            "distinct_id": this.deviceid,
            "first_id": "",
            "props": {
                "$latest_traffic_source_type": "引荐流量",
                "$latest_search_keyword": "未取到值",
                "$latest_referrer": "https://t.co/"
            },
            "identities": base64String,
            "history_login_id": {
                "name": "",
                "value": ""
            },
            "$device_id": this.deviceid,
        }
        return data;
    }

    async getSignMessage() {
        const resp = await fetch(`https://api.xter.io/account/v1/login/wallet/${this.address}`, {
            "headers": {
                "accept": "*/*",
                "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
                "authorization": "",
                "content-type": "application/json",
                "sec-ch-ua": "\"Google Chrome\";v=\"123\", \"Not:A-Brand\";v=\"8\", \"Chromium\";v=\"123\"",
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "\"macOS\"",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-site",
                "sensorsdatajssdkcross": this.getSensorsdata(),
                "Referer": "https://xter.io/",
                "Referrer-Policy": "strict-origin-when-cross-origin"
            },
            "body": null,
            "method": "GET"
        });
        const text = await resp.text();
        const respData = JSON.parse(text);
        if (respData.err_code !== 0) {
            throw new Error(`${this.address} Request Error: ${text}`);
        }
        return respData.data.message;
    }
    async postWallet(message) {
        const wallet = new ethers.Wallet(this.account.privateKey);
        const sign = await wallet.signMessage(message);
        const body = {
            "address": this.address,
            "type": "eth",
            "sign": sign,
            "provider": "METAMASK",
            "invite_code": ""
        }
        const url = "https://api.xter.io/account/v1/login/wallet";
        const respData = await this.post(url, body)
        const {is_new, access_token, id_token, refresh_token} = respData;
        this.is_new = is_new;
        this.access_token = access_token;
        this.id_token = id_token;
        this.refresh_token = refresh_token;
        return respData;
    }
    async profile() {
        const url = 'https://api.xter.io/account/v1/user/profile';
        return this.get(url, {s: ''})
    }
    async wallet() {
        const url = 'https://api.xter.io/account/v1/wallet';
        return this.get(url, {});
    }
    async getConfig() {
        const url = 'https://api.xter.io/palio/v1/config';
        return this.get(url, {});
    }
    async task() {
        const url = `https://api.xter.io/palio/v1/user/${this.address}/task`;
        return this.get(url, {});
    }
    async postTask(taskId) {
        const url = `https://api.xter.io/palio/v1/user/${this.address}/task`;
        return this.post(url, {task_id: taskId})
    }
    async taskReport(taskId) {
        const url = `https://api.xter.io/palio/v1/user/${this.address}/task/report`;
        return this.post(url, {task_id: taskId});
    }
    async unread() {
        const url = 'https://api.xter.io/message/v1/state/unread';
        return this.get(url, {});
    }
    async ticket() {
        const url = `https://api.xter.io/palio/v1/user/${this.address}/ticket`;
        return this.get(url, {})
    }
    async incubation() {
        const url = `https://api.xter.io/palio/v1/user/${this.address}/incubation`;
        return this.get(url);
    }
    async point() {
        const url = `https://api.xter.io/palio/v1/user/${this.address}/point`;
        return this.get(url);
    }
    async inviteCode() {
        const url = `https://api.xter.io/palio/v1/user/${this.address}/invite/code`;
        return this.get(url);
    }
    async games() {
        const url = 'https://api.xter.io/proj/v1/games';
        return this.get(url);
    }
    async apply(code) {
        const url = `https://api.xter.io/palio/v1/user/${this.address}/invite/apply`;
        const body = {code}
        return await this.post(url, body);
    }

    async prop(propId) {
        const url = `https://api.xter.io/palio/v1/user/${this.address}/prop`;
        const body = {"prop_id":propId};
        return await this.post(url, body);
    }
    async retry() {
        const url = `https://api.xter.io/palio/v1/user/${this.address}/chat/retry`;
        return this.post(url, {});
    }
    async chat() {
        const url = `https://api.xter.io/palio/v1/user/${this.address}/chat`;
        /**
         *         "max_score": 97,
         *         "retry": 2,  // 已经重试的次数
         *         "boost": 9
         */
        return this.get(url);
    }
    async talk(answer) {
        if (this.config === null) {
            this.config = await this.getConfig();
        }
        const url = `${this.config.chat_api}?address=${this.address}`
        const body = {"answer":answer};
        const resp = await fetch(url, {
            "headers": {
                "accept": "*/*",
                "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
                "authorization": this.id_token,
                "content-type": "text/plain;charset=UTF-8",
                "sec-ch-ua": "\"Google Chrome\";v=\"123\", \"Not:A-Brand\";v=\"8\", \"Chromium\";v=\"123\"",
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "\"macOS\"",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "cross-site"
            },
            "referrer": "https://xter.io/",
            "referrerPolicy": "strict-origin-when-cross-origin",
            "body": JSON.stringify(body),
            "method": "POST",
            "mode": "cors",
            "credentials": "include"
        });
        return await resp.text();
    }

}

module.exports = XterApi