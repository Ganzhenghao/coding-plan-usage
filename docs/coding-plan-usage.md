# CodingPlan用量Google浏览器插件

> 实现一个谷歌浏览器插件,该插件提供智谱GLM和Minimax 编码套餐的用量查询
>
> 点击后展示GLM和minimax套餐的当前用量百分比以及刷新时间, GLM额外展示工具调用次数



## 1. GLM用量查询实现

### GLM查询接口

```
curl 'https://bigmodel.cn/api/monitor/usage/quota/limit' \
  -H 'accept: application/json, text/plain, */*' \
  -H 'accept-language: zh' \
  -H 'authorization: eyJhbGciOiJIUzUxMiJ9.eyJ1c2VyX3R5cGUiOiJQRVJTT05BTCIsInVzZXJfY2hhbm5lbCI6IldFQ0hBVF9PUEVOIiwidXNlcl9pZCI6MjUxOTQxNywidXNlcl9rZXkiOiJkZmM4OTIwZC05YzZjLTRjYmEtYjY2OC1iNmYzOGJjMDg0NTYiLCJjdXN0b21lcl9pZCI6IjQ2NjIxNzU0NjEzMzExNDAwIiwidXNlcm5hbWUiOiLkuKhEb3JhZW1vbuS4qCJ9.FhRLVPRd0mkc6M9a2-NOTkU3cdiLTx84NQVr3xhjl7czXU1V96ux7r6lJg-9TMGm_BXvj-z0fDwfLJvS7wXW9g' \
  -H 'priority: u=1, i' \
  -H 'referer: https://bigmodel.cn/usercenter/glm-coding/usage' \
  -H 'sec-ch-ua: "Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "macOS"' \
  -H 'sec-fetch-dest: empty' \
  -H 'sec-fetch-mode: cors' \
  -H 'sec-fetch-site: same-origin' \
  -H 'set-language: zh' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
```



### 接口响应示例

> TOKENS_LIMIT 代表token限额
>
> TIME_LIMIT 代表mcp工具限额, usageDetails代表每个工具的调用次数

```json
{
    "code": 200,
    "msg": "操作成功",
    "data": {
        "limits": [
            {
                "type": "TIME_LIMIT",
                "unit": 5,
                "number": 1,
                "usage": 100,
                "currentValue": 1,
                "remaining": 99,
                "percentage": 1,
                "nextResetTime": 1775005951998,
                "usageDetails": [
                    {
                        "modelCode": "search-prime",
                        "usage": 0
                    },
                    {
                        "modelCode": "web-reader",
                        "usage": 1
                    },
                    {
                        "modelCode": "zread",
                        "usage": 0
                    }
                ]
            },
            {
                "type": "TOKENS_LIMIT",
                "unit": 3,
                "number": 5,
                "percentage": 10,
                "nextResetTime": 1773731091485
            }
        ],
        "level": "lite"
    },
    "success": true
}
```



### 实现逻辑

从https://bigmodel.cn/usercenter/glm-coding/usage网站的的https://bigmodel.cn/下的cookie中获取bigmodel_token_production作为请求的authorization

如果获取不到,则跳转到https://bigmodel.cn/login?redirect=%2Fusercenter%2Fsettings%2Faccount请求用户登录后,再获取

## Minimax查询实现

### 查询接口

```
curl --location 'https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains' \
--header 'Authorization: Bearer <API Key>' \
--header 'Content-Type: application/json'
```



### 响应示例

```json
{
    "model_remains": [
        {
            "start_time": 1773712800000,
            "end_time": 1773730800000,
            "remains_time": 10779779,
            "current_interval_total_count": 1500,
            "current_interval_usage_count": 1199,
            "model_name": "MiniMax-M2"
        },
        {
            "start_time": 1773712800000,
            "end_time": 1773730800000,
            "remains_time": 10779779,
            "current_interval_total_count": 1500,
            "current_interval_usage_count": 1199,
            "model_name": "MiniMax-M2.1"
        },
        {
            "start_time": 1773712800000,
            "end_time": 1773730800000,
            "remains_time": 10779779,
            "current_interval_total_count": 1500,
            "current_interval_usage_count": 1199,
            "model_name": "MiniMax-M2.5"
        }
    ],
    "base_resp": {
        "status_code": 0,
        "status_msg": "success"
    }
}
```



### 实现逻辑

方式1: 要求用户手动输入请求的APIKey即可

方式2:提供自动获取按钮,从https://platform.minimaxi.com/user-center/payment/coding-plan网站的https://platform.minimaxi.com/下获取所有cookie,然后携带cookie请求apikey获取接口获取coding plan的apikey,如果无法获取,则跳转到https://platform.minimaxi.com/login?redirect=%2Fuser-center%2Fpayment%2Fcoding-plan页面提示用户登录

获取apikey的接口

```
curl 'https://www.minimaxi.com/backend/token?token_type=4&GroupId=1984790264836792933' \
  -H 'accept: application/json, text/plain, */*' \
  -H 'accept-language: zh-CN,zh;q=0.9' \
  -b 'sensorsdata2015jssdkchannel=%7B%22prop%22%3A%7B%22_sa_channel_landing_url%22%3A%22%22%7D%7D; _c_WBKFRo=MtjT63PUO55uNLTxKutDhUkvc3LhNL8RrvVBXsxl; _ga=GA1.1.1219940897.1772162480; _gcl_au=1.1.893207702.1772162480; _uetvid=1281f84013ac11f1b99dcd1bbf9f53e2; _gc_usr_id_cs0_d0_sec0_part0=6406b1ad-0bf9-4b54-b960-99778e7f8877; _token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzYxMzEyNzIsInVzZXIiOnsiaWQiOiI0NDE1NzY4NzA0MDM0NjExMjQiLCJuYW1lIjoiwqAgwqAgwqAgwqDCoCIsImF2YXRhciI6Imh0dHBzOi8vdGhpcmR3eC5xbG9nby5jbi9t; sensorsdata2015jssdkcross=%7B%22distinct_id%22%3A%2219cbbb01dee424-02d975a3fe9868-1a525631-2073600-19cbbb01def13fe%22%2C%22first_id%22%3A%22%22%2C%22props%22%3A%7B%22%24latest_traffic_source_type%22%3A%22%E7%9B%B4%E6%8E%A5%E6%B5%81%E9%87%8F%22%2C%22%24latest_search_keyword%22%3A%22%E6%9C%AA%E5%8F%96%E5%88%B0%E5%80%BC_%E7%9B%B4%E6%8E%A5%E6%89%93%E5%BC%80%22%2C%22%24latest_referrer%22%3A%22%22%7D%2C%22identities%22%3A%22eyIkaWRlbnRpdHlfY29va2llX2lkIjoiMTljOWNjMGQxZGQ5M2YtMDU2M2JiMmJlNTRmYjctMWE1MjU2MzEtMjA3MzYwMC0xOWM5Y2MwZDFkZTI5ZWMifQ%3D%3D%22%2C%22history_login_id%22%3A%7B%22name%22%3A%22%22%2C%22value%22%3A%22%22%7D%2C%22%24device_id%22%3A%2219c9cc0d1dd93f-0563bb2be54fb7-1a525631-2073600-19c9cc0d1de29ec%22%7D; _gc_s_cs0_d0_sec0_part0=rum=0&expire=1773731523591; _ga_9XENMDQS08=GS2.1.s1773730443$o14$g0$t1773730630$j60$l0$h0; HERTZ-SESSION=MTc3MzczMTA2NnxOd3dBTkZFMFV6VkxVVk5SV2xaT1YxRTNURkZNU3pOTlJFSlBVVU5aTkRJMVZrUkhRa05SUVZoQ1ZVVkVNbFpSVEZOS1YxVklWMEU9fFpDdyyGFMJE6cuKTAtc_fv_qbaW1bGHpRECFJZzztxQ' \
  -H 'origin: https://platform.minimaxi.com' \
  -H 'priority: u=1, i' \
  -H 'referer: https://platform.minimaxi.com/' \
  -H 'sec-ch-ua: "Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "macOS"' \
  -H 'sec-fetch-dest: empty' \
  -H 'sec-fetch-mode: cors' \
  -H 'sec-fetch-site: same-site' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
```

响应如下complete_token字段就是所需的apikey

```
{
    "tokens": [
        {
            "token_id": "1998587529237893468",
            "token": "sk-cp-...yNJI0M",
            "group_id": "1984790264836792933",
            "expire_time": "",
            "last_used_time": "2026-03-17 14:50:25",
            "create_time": "2025-12-10 14:38:59",
            "name": "coding_plan",
            "status": 0,
            "token_type": 4,
            "complete_token": "sk-cp--sukZkB3L-QWqfoBXRrl1q4JbQTtGTw4aWMzyn_TZdh0d5S5ZMhpmWUCIt5DxYbOusPyevOQy1CmmgrDhOv-a78m0qE3vttYU3k1iK5r4vb6vtIzDyNJI0M"
        }
    ],
    "base_resp": {
        "status_code": 0,
        "status_msg": "success"
    }
}
```
图标位于docs/icons下
