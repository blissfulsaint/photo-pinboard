export interface Gps {lat:number;lng:number}
export interface Assignment extends Gps {label?:string;source?:string;provenance?:string;assignedAt?:string}
export type Assignments=Record<string,Assignment>;
export interface Place extends Gps {name:string}
export type ScanState='scanning'|'ready'|'unreadable';
export type PhotoStatus='needs'|'pending'|'geotagged'|'scanning'|'unreadable';
export type FileLike=Blob & {name?:string;lastModified?:number;webkitRelativePath?:string};
export interface Metadata {
 scanState:ScanState;
 embedded:Gps|null;
 scanError?:string|null;
 capturedAt?:string|null;
 kind?:'video'|'photo';
 duration?:number|null;
 videoCodec?:string|null;
}
export interface MediaRecord {
 id:string;name:string;path:string;folder:string;
 demo?:boolean;kind?:number|'photo'|'video';date?:string;
 desktopId?:string;size?:number;modified?:number;hash?:string;
 file?:FileLike;previewUrl?:string;type?:string;
 embedded?:Gps|null;capturedAt?:string|null;scanState?:ScanState;scanError?:string|null;
 duration?:number|null;videoCodec?:string|null;
}
export interface CaptureDate {exif:string;offset:string;iso:string}
export interface CaptureInput {value:string;offset:string}
export interface PreparedJpeg {bytes:ArrayBuffer;hash:string}
export type WriteFields={gps:Gps;captureDate?:never}|{captureDate:CaptureInput;gps?:never};
export interface WriteResult extends Partial<Metadata> {
 hash:string;outputPath?:string;sourceHash?:string;size?:number;modified?:number;
 file?:FileLike;previewUrl?:string;mediaVerified?:boolean;
}
export interface RootFolder {id:string;name:string;path:string}
export interface RecentFolder {name:string;path:string}
export interface ProgressState {
 schemaVersion:number;assignments:Assignments;places:Place[];expanded:Record<string,boolean>;recentFolders:RecentFolder[];
 warning?:string;
}
export type ProgressPatch=Partial<Pick<ProgressState,'assignments'|'places'|'expanded'>>;
export type WriteMode='originals'|'copies';
export interface NativeWriteRequest {
 id:string;expectedHash:string;gps?:Gps;captureDate?:CaptureInput;mode:WriteMode;outputRootId?:string;
}
export interface OpenFolderResult {root:RootFolder;photos:MediaRecord[];recentFolders:RecentFolder[]}
export interface DesktopBridge {
 loadState():Promise<ProgressState>;
 saveState(patch:ProgressPatch):Promise<boolean>;
 openFolder():Promise<OpenFolderResult|null>;
 openRecent(index:number):Promise<OpenFolderResult>;
 chooseOutput():Promise<Pick<RootFolder,'id'|'name'>|null>;
 scanPhoto(id:string):Promise<Metadata & {hash:string}>;
 writePhoto(request:NativeWriteRequest):Promise<WriteResult>;
 exportText(request:{name:string;text:string}):Promise<boolean>;
 importBackup():Promise<{name:string;text:string}|null>;
 appInfo():Promise<{version:string;dataDirectory:string}>;
 rendererReady():Promise<boolean>;
}
export interface ScanRequest {id:string;file?:FileLike}
export type ScanResponse={id:string;hash?:string}&Partial<Metadata>;
export interface Scanner {
 terminate():void;
 postMessage(request:ScanRequest):void;
 onmessage:((event:MessageEvent<ScanResponse>)=>void)|null;
 onerror:((event:ErrorEvent)=>void)|null;
}
export interface WriteReportItem {
 sourcePath:string;success:boolean;error?:string;sourceHash?:string;outputPath?:string;outputHash?:string;
 lat?:number;lng?:number;capturedAt?:string|null;verification?:string;delivery?:string;
}
export interface WriteReport {createdAt:string;mode:WriteMode|'dates';results:WriteReportItem[]}
export interface WriteProgress {running:boolean;done:number;total:number;kind?:'dates'}
export interface SourceFileHandle {
 getFile():Promise<FileLike>;
 createWritable(options?:{keepExistingData?:boolean}):Promise<{write(blob:Blob):Promise<void>;close():Promise<void>;abort():Promise<void>}>;
}
export interface SourceDirectory {
 name:string;
 getDirectoryHandle(name:string,options?:{create?:boolean}):Promise<SourceDirectory>;
 getFileHandle(name:string,options?:{create?:boolean}):Promise<SourceFileHandle>;
 queryPermission?(options:{mode:'readwrite'}):Promise<PermissionState>;
 requestPermission?(options:{mode:'readwrite'}):Promise<PermissionState>;
}
export interface FolderNode {name:string;path:string;count:number;children:FolderNode[]}

export interface IpcApi {
 'load-state':DesktopBridge['loadState'];'save-state':DesktopBridge['saveState'];
 'open-folder':DesktopBridge['openFolder'];'open-recent':DesktopBridge['openRecent'];
 'choose-output':DesktopBridge['chooseOutput'];'scan-photo':DesktopBridge['scanPhoto'];
 'write-photo':DesktopBridge['writePhoto'];'export-text':DesktopBridge['exportText'];
 'import-backup':DesktopBridge['importBackup'];'app-info':DesktopBridge['appInfo'];
 'renderer-ready':DesktopBridge['rendererReady'];
}
