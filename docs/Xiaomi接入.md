添加Xiaomi用量页面

登录页面 https://account.xiaomi.com/fe/service/login/password?_group=DEFAULT&sid=api-platform&qs=%253Fcallback%253Dhttps%25253A%25252F%25252Fplatform.xiaomimimo.com%25252Fsts%25253Fsign%25253DM7gfywevl3CG5YTTcZDifhK6IK8%2525253D%252526followup%25253Dhttps%2525253A%2525252F%2525252Fplatform.xiaomimimo.com%2525252Fconsole%2525252Fbalance%2526sid%253Dapi-platform%2526_group%253DDEFAULT&callback=https%3A%2F%2Fplatform.xiaomimimo.com%2Fsts%3Fsign%3DM7gfywevl3CG5YTTcZDifhK6IK8%253D%26followup%3Dhttps%253A%252F%252Fplatform.xiaomimimo.com%252Fconsole%252Fbalance&_sign=iV9Q5kxBqXGdbkb6kmapXvJrkZM%3D&serviceParam=%7B%22checkSafePhone%22%3Afalse%2C%22checkSafeAddress%22%3Afalse%2C%22lsrp_score%22%3A0.0%7D&showActiveX=false&theme=&needTheme=false&bizDeviceType=&_locale=zh_CN

token位于https://platform.xiaomimimo.com中的Cookie api-platform_serviceToken
token的存储格式如下: "A/EKIm1WUwZbhPRjZZvdHg+Q7wbKxCFPms1MRbsSo3VXatU+Ufh9X7/ANUJsfc8WkwT7u1wwZSSOUkpV9i7D8AOAl6TWIydaiufKaWxDek8bG4siGGEoznMOd+W7YmLcwMC3Ptuhd1tZ9HdSX8e17u3Ostln5yP0VljF2JpKnm2L5xSKwSYFwiHd36Y+EAF0Qyp1jogi4Lk4Fwvd+Kj4J+Vc7zhuJojYkLmkABFhoqzfRTKZdgmuiUkCuXMbmnNbmqNfYCPh9aZWH05x8gSebmRxRMi7iYV+LiTSeqLVAH7YP725+l5aUv4fLyWgWZWcBVT84Jk7abVkpIGBHZ9QawViLfv8jTNK2wH36T1xqoM="

用量页面位于https://platform.xiaomimimo.com/console/plan-manage



以下是用户摘要接口

```curl
curl 'https://platform.xiaomimimo.com/api/v1/tokenPlan/usage' \
  -H 'accept: */*' \
  -H 'accept-language: zh' \
  -H 'content-type: application/json' \
  -b 'userId=996811750; api-platform_serviceToken="A/EKIm1WUwZbhPRjZZvdHg+Q7wbKxCFPms1MRbsSo3VXatU+Ufh9X7/ANUJsfc8WkwT7u1wwZSSOUkpV9i7D8AOAl6TWIydaiufKaWxDek8bG4siGGEoznMOd+W7YmLcwMC3Ptuhd1tZ9HdSX8e17u3Ostln5yP0VljF2JpKnm3K1nE22KLks6xe5o2jMeujM+SBZrHMc+10CVjTd/C8fzO/Z6LACp22rRCh0DadxIOA2vb+1AvykvwhSlVvwYkQabaU+gk4PXtH6hc5OxZ1Xh82qwxNONkmnMuZu/lV2z1Hwvyttfas/eRFhjbKDsP/nOtz8Oc5S9h+71pHRhbG47wtpNO38tdBULOJM1AuVlA="; api-platform_slh="fGZCvMo7BDYTwcHv35wKtAvv/JQ="; api-platform_ph="hzCO0rCKHAalfxZCKGTKSQ=="' \
  -H 'priority: u=1, i' \
  -H 'referer: https://platform.xiaomimimo.com/console/plan-manage' \
  -H 'sec-ch-ua: "Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "macOS"' \
  -H 'sec-fetch-dest: empty' \
  -H 'sec-fetch-mode: cors' \
  -H 'sec-fetch-site: same-origin' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36' \
  -H 'x-timezone: Asia/Shanghai'
```



响应数据

```json
{
  "code": 0,
  "message": "",
  "data": {
    "monthUsage": {
      "percent": 0,
      "items": [
        {
          "name": "month_total_token",
          "used": 0,
          "limit": 4100000000,
          "percent": 0
        }
      ]
    },
    "usage": {
      "percent": 0.00,
      "items": [
        {
          "name": "plan_total_token",
          "used": 0,
          "limit": 4100000000,
          "percent": 0.00
        },
        {
          "name": "compensation_total_token",
          "used": 0,
          "limit": 0,
          "percent": 0
        }
      ]
    }
  }
}
```

