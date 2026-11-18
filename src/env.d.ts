import type {DesktopBridge} from './models.js';
import 'react';
declare global {
 const __APP_VERSION__:string;
 interface Window {pinboardDesktop?:DesktopBridge}
}
declare module 'react' {
 interface InputHTMLAttributes<T> {webkitdirectory?:string}
}
