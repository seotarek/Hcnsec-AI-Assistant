import * as https from 'https';
import * as http from 'http';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ApiConfig {
    apiKey: string;
    endpoint: string;
    model: string;
}

export async function callApi(config: ApiConfig, messages: ChatMessage[]): Promise<string> {
    return new Promise((resolve) => {
        try {
            const urlObj = new URL(config.endpoint);
            const isHttps = urlObj.protocol === 'https:';
            const lib = isHttps ? https : http;

            const body = JSON.stringify({
                model: config.model,
                messages,
                stream: false
            });

            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                }
            };

            const req = lib.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.choices && json.choices.length > 0) {
                            resolve(json.choices[0].message.content);
                        } else {
                            resolve(`❌ API Error: ${json.error?.message || JSON.stringify(json)}`);
                        }
                    } catch (e: any) {
                        resolve(`❌ Parse Error: ${e.message}\nRaw: ${data.substring(0, 200)}`);
                    }
                });
            });

            req.on('error', (e) => {
                resolve(`❌ Network Error: ${e.message}`);
            });

            req.setTimeout(60000, () => {
                req.destroy();
                resolve('❌ Request timed out after 60 seconds.');
            });

            req.write(body);
            req.end();
        } catch (error: any) {
            resolve(`❌ Setup Error: ${error.message}`);
        }
    });
}

export async function testConnection(config: ApiConfig): Promise<string> {
    return new Promise((resolve) => {
        try {
            const modelsEndpoint = config.endpoint.replace('/chat/completions', '/models');
            const urlObj = new URL(modelsEndpoint);
            const isHttps = urlObj.protocol === 'https:';
            const lib = isHttps ? https : http;

            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                }
            };

            const req = lib.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve('ok');
                    } else {
                        resolve(`HTTP ${res.statusCode}: ${data.substring(0, 100)}`);
                    }
                });
            });

            req.on('error', (e) => resolve(e.message));
            req.setTimeout(10000, () => { req.destroy(); resolve('timeout'); });
            req.end();
        } catch (e: any) {
            resolve(e.message);
        }
    });
}
