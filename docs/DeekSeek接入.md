添加DeepSeek用量和余额查询页面

登录页面 https://platform.deepseek.com/sign_in

token位于https://platform.deepseek.com 本地存储 userToken

用量页面位于https://platform.deepseek.com/usage

deepseek不是tokenplan需要的不是用量提醒 而是余额提醒



以下是用户摘要接口

```curl
curl 'https://platform.deepseek.com/api/v0/users/get_user_summary' \
  -H 'accept: */*' \
  -H 'accept-language: zh-CN,zh;q=0.9' \
  -H 'authorization: Bearer amq4y5z6I5FxgDCJQMwabezuQcMZI4LfcVJrpdTyruX1aAhfk4b7ZZhpLNjSwLCh' \
  -b 'smidV2=202604270902065d1a974050bd20356f5960cae091fe75009fa7dfcf5f94720; HWWAFSESID=0e2b5766acc27ae7b0; HWWAFSESTIME=1779757095751; .thumbcache_6b2e5483f9d858d7c661c5e276b6a6ae=oBqgs72x4sOLNwRtzW5TBU7IjKxIoVsGPZPlmoJOVPYTPSiSGSk8UxgLdUrDaXsMxIjdw+Dxy/U6ZEhYPBu0SQ%3D%3D' \
  -H 'priority: u=1, i' \
  -H 'referer: https://platform.deepseek.com/usage' \
  -H 'sec-ch-ua: "Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "macOS"' \
  -H 'sec-fetch-dest: empty' \
  -H 'sec-fetch-mode: cors' \
  -H 'sec-fetch-site: same-origin' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36' \
  -H 'x-app-version: 1.0.0'
```



示例数据

```json
{
    "code": 0,
    "msg": "",
    "data": {
        "biz_code": 0,
        "biz_msg": "",
        "biz_data": {
            "current_token": 10000000,
            "monthly_usage": "16307571",
            "total_usage": 0,
            "normal_wallets": [
                {
                    "currency": "CNY",
                    "balance": "14.8706779200000000",
                    "token_estimation": "4956892"
                }
            ],
            "bonus_wallets": [
                {
                    "currency": "CNY",
                    "balance": "0",
                    "token_estimation": "0"
                }
            ],
            "total_available_token_estimation": "4956892",
            "monthly_costs": [
                {
                    "currency": "CNY",
                    "amount": "3.9096908800000000"
                }
            ],
            "monthly_token_usage": "16307571"
        }
    }
}
```

