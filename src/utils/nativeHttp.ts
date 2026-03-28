import { CapacitorHttp, HttpOptions } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';

/**
 * nativeFetch — 在原生 iOS/Android 平台上，将 fetch 请求转为 CapacitorHttp.request()，
 * 走 iOS URLSession / Android OkHttp，绕开 WebView 网络栈在 App 切后台后重建连接的延迟。
 *
 * 只用于 /rest/v1/ 数据请求，Auth 和 Storage 上传仍走 WebView fetch（CORS 要求）。
 */
export const nativeFetch: typeof fetch = async (input, init) => {
  // Web 环境直接透传标准 fetch
  if (!Capacitor.isNativePlatform()) {
    return fetch(input, init);
  }

  const url =
    typeof input === 'string'
      ? input
      : input instanceof Request
      ? input.url
      : String(input);

  // 合并请求头
  const rawHeaders: Record<string, string> = {};
  const initHeaders = init?.headers;
  if (initHeaders) {
    if (initHeaders instanceof Headers) {
      initHeaders.forEach((v, k) => { rawHeaders[k] = v; });
    } else if (Array.isArray(initHeaders)) {
      initHeaders.forEach(([k, v]) => { rawHeaders[k] = v; });
    } else {
      Object.assign(rawHeaders, initHeaders);
    }
  }

  // 处理请求体
  let data: any = undefined;
  if (init?.body !== undefined && init.body !== null) {
    if (typeof init.body === 'string') {
      try {
        data = JSON.parse(init.body);
      } catch {
        data = init.body;
      }
    } else {
      // ArrayBuffer / FormData 等二进制类型回退到 WebView fetch
      return fetch(input, init);
    }
  }

  const options: HttpOptions = {
    url,
    method: (init?.method || 'GET').toUpperCase(),
    headers: rawHeaders,
    data,
    // 禁用 CapacitorHttp 自动解析 JSON，让调用方（Supabase SDK）自己处理
    responseType: 'text',
    webFetchExtra: undefined,
  };

  try {
    const nativeResponse = await CapacitorHttp.request(options);

    // 把 CapacitorHttp 响应包装成标准 Response 对象
    // 204 / 205 / 304 等状态码按 HTTP 规范不允许携带 body，必须传 null
    const bodylessStatuses = new Set([101, 204, 205, 304]);
    const responseBody = bodylessStatuses.has(nativeResponse.status)
      ? null
      : typeof nativeResponse.data === 'string'
        ? nativeResponse.data
        : JSON.stringify(nativeResponse.data);

    return new Response(responseBody, {
      status: nativeResponse.status,
      headers: new Headers(nativeResponse.headers as Record<string, string>),
    });
  } catch (err) {
    console.error('[nativeFetch] CapacitorHttp failed:', err);
    throw err;
  }
};
