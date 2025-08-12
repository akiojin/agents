import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import type { Tool } from './manager.js';
export declare class MCPClient extends EventEmitter {
    private name;
    private process;
    private connected;
    private requestId;
    private pendingRequests;
    private timeout;
    private maxRetries;
    constructor(name: string, options?: {
        timeout?: number;
        maxRetries?: number;
    });
    connect(process: ChildProcess): Promise<void>;
    private initialize;
    private handleData;
    private sendRequest;
    private sendNotification;
    listTools(): Promise<Tool[]>;
    invokeTool(name: string, params?: Record<string, unknown>): Promise<unknown>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    getName(): string;
    getTimeout(): number;
    getMaxRetries(): number;
    /**
     * MCPのErrorがRetry可能かを判定
     */
    private isRetryableError;
}
/**
 * HTTP MCP クライアント
 */
export declare class HTTPMCPClient extends EventEmitter {
    private name;
    private url;
    private connected;
    private timeout;
    private maxRetries;
    constructor(name: string, url: string, options?: {
        timeout?: number;
        maxRetries?: number;
    });
    connect(): Promise<void>;
    private initialize;
    listTools(): Promise<Tool[]>;
    invokeTool(name: string, params?: Record<string, unknown>): Promise<unknown>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    getName(): string;
    getTimeout(): number;
    getMaxRetries(): number;
}
/**
 * SSE MCP クライアント
 */
export declare class SSEMCPClient extends EventEmitter {
    private name;
    private url;
    private connected;
    private timeout;
    private maxRetries;
    private eventSource?;
    private requestId;
    private pendingRequests;
    constructor(name: string, url: string, options?: {
        timeout?: number;
        maxRetries?: number;
    });
    connect(): Promise<void>;
    private initialize;
    private handleMessage;
    private sendRequest;
    listTools(): Promise<Tool[]>;
    invokeTool(name: string, params?: Record<string, unknown>): Promise<unknown>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    getName(): string;
    getTimeout(): number;
    getMaxRetries(): number;
}
