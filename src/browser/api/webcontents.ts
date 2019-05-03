import { WebContents } from 'electron';


export function executeJavascript (webcontents: WebContents, code: string, callback: (result: any) => void) {
   webcontents.executeJavaScript(code, true, callback);
}