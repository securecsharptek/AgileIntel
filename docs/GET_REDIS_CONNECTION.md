**Azure Redis - Get Fresh Connection String**

Please follow these steps to get the EXACT connection string:

1. Go to Azure Portal: https://portal.azure.com
2. Navigate to: **All Resources** → Search for "redis-media-pipeline-ffmpeg"
3. Click on the Redis Cache instance

4. In the left menu, click **"Settings"** → **"Access keys"**

5. Check the **"Authentication method"**:
   - If it says **"Access keys"** → Continue below
   - If it says **"Microsoft Entra ID"** → This is the problem! Change it to "Access keys"

6. Copy the **"Primary connection string (StackExchange.Redis)"**
   - It should look like:
     ```
     redis-media-pipeline-ffmpeg.redis.cache.windows.net:6380,password=XXXXX,ssl=True,abortConnect=False
     ```

7. Extract the PASSWORD from that string (the part after `password=` and before `,ssl=`)

8. Also copy the **"Primary"** key (should be under Access Keys section)
   - It's a long string ending with `=`

---

**Then tell me:**
- Authentication method: Access keys or Microsoft Entra ID?
- Last 10 characters of the Primary key (for verification)
- Does the key end with `=` sign?

This will help identify if:
- Keys have changed
- Authentication method is wrong
- Connection string format issue
