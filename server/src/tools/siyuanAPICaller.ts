// MCPWithHUI/server/src/tools/siyuanAPICaller.ts
// Provides a utility function to call Siyuan API endpoints.

/**
 * Represents the structure of a Siyuan API configuration.
 * These values are typically read from `siyuan.config.json`.
 */
export interface SiyuanAPIConfig {
  kernelServePath: string;
  accessToken: string;
}

/**
 * Represents the standard response structure from many Siyuan API endpoints.
 */
export interface SiyuanStandardResponse<T = any> {
  code: number;
  msg: string;
  data: T;
}

/**
 * Calls a Siyuan API endpoint.
 *
 * @param kernelServePath The base URL of the Siyuan kernel service (e.g., "http://127.0.0.1:6806").
 * @param accessToken The API access token for Siyuan.
 * @param endpoint The API endpoint path (e.g., "/api/notebook/lsNotebooks").
 * @param payload Optional payload for the request. For GET, it's converted to query params. For POST/PUT, it's the JSON body.
 * @param method The HTTP method to use (default: "POST").
 * @returns A Promise that resolves with the data from the Siyuan API response.
 * @template T The expected type of the data in the Siyuan API response.
 */
export async function callSiyuanAPI<T = any>(
  kernelServePath: string,
  accessToken: string,
  endpoint: string,
  payload?: Record<string, any> | any[] | string | number | boolean | null,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST'
): Promise<T> {
  let fullUrl = `${kernelServePath}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (accessToken) {
    headers['Authorization'] = `Token ${accessToken}`;
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (method !== 'GET' && method !== 'DELETE' && payload !== undefined && payload !== null) {
    options.body = JSON.stringify(payload);
  } else if (method === 'GET' && payload && typeof payload === 'object' && payload !== null) {
    const queryParams = new URLSearchParams();
    for (const key in payload as Record<string, any>) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        const value = (payload as Record<string, any>)[key];
        // Ensure value is not undefined or null before appending
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      }
    }
    const queryString = queryParams.toString();
    if (queryString) {
      fullUrl += `?${queryString}`;
    }
  }

  const response = await fetch(fullUrl, options);

  if (!response.ok) {
    let errorBody: any;
    try {
      errorBody = await response.json();
    } catch (e) {
      const errorText = await response.text();
      throw new Error(
        `Siyuan API request to ${method} ${fullUrl} failed: ${response.status} ${response.statusText}. Response: ${errorText}`
      );
    }

    if (errorBody && typeof errorBody.code === 'number' && errorBody.msg !== undefined) {
      throw new Error(
        `Siyuan API request to ${method} ${fullUrl} failed: ${response.status} ${response.statusText}. Code: ${errorBody.code}, Message: ${errorBody.msg}`
      );
    }
    throw new Error(
      `Siyuan API request to ${method} ${fullUrl} failed: ${response.status} ${response.statusText}. Body: ${JSON.stringify(errorBody)}`
    );
  }

  // Handle cases where response might be empty (e.g., 204 No Content)
  if (response.status === 204) {
    return null as T; // Or undefined, depending on expected behavior for no content
  }
  
  const result = await response.json();

  // Check for Siyuan's standard { code, msg, data } structure
  if (result && typeof result.code === 'number') {
    if (result.code !== 0) {
      throw new Error(
        `Siyuan API error for ${method} ${fullUrl}: Code ${result.code}, Message: ${result.msg || 'No message'}`
      );
    }
    return result.data as T;
  }

  // If the response is not in the standard Siyuan structure but was successful
  return result as T;
} 