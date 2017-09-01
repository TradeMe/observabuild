export class TeamCityLogger {
    message(text: string, flowId?: string): void {
        console.log(`##teamcity[message text='${this.escapeText(text)}'${this.formatFlowId(flowId)}]`);
    }

    warning(text: string, flowId?: string): void {
        console.log(`##teamcity[message text='${this.escapeText(text)}' status='WARNING'${this.formatFlowId(flowId)}]`);
    }

    error(text: string, errorDetails: string | null, flowId?: string): void {
        console.log(`##teamcity[message text='${this.escapeText(text)}'${this.formatErrorDetails(errorDetails)} status='ERROR'${this.formatFlowId(flowId)}]`);
    }
    
    buildProblem(description: string): void {
        console.error(`##teamcity[buildProblem description='${this.escapeText(description)}']`);
    }

    buildStatus(status: string): void {
        console.log(`##teamcity[buildStatus text='{build.status.text}${this.escapeText(status)}']`);
    }

    blockOpened(blockName: string, description: string, flowId?: string): void {
        console.log(`##teamcity[blockOpened name='${this.escapeText(blockName)}' description='${this.escapeText(description)}'${this.formatFlowId(flowId)}]`);
    }

    blockClosed(blockName: string, flowId?: string): void {
        console.log(`##teamcity[blockClosed name='${this.escapeText(blockName)}'${this.formatFlowId(flowId)}]`);
    }

    progress(message: string): void {
        console.log(`##teamcity[progressMessage '${this.escapeText(message)}']`);
    }

    progressStart(message: string): void {
        console.log(`##teamcity[progressStart '${this.escapeText(message)}']`);
    }

    progressFinish(message: string): void {
        console.log(`##teamcity[progressFinish '${this.escapeText(message)}']`);
    }

    publishArtifacts(path: string): void {
        console.log(`##teamcity[publishArtifacts '${this.escapeText(path)}']`);
    }

    private formatFlowId(flowId?: string): string {
        return !flowId ? '' :  ` flowId='${this.escapeText(flowId)}'`;
    }

    private formatErrorDetails(errorDetails: string | null): string {
        return !errorDetails ? '' : ` errorDetails='${this.escapeText(errorDetails)}'`;
    }

    private escapeText(message: string): string {
        // https://confluence.jetbrains.com/display/TCD10/Build+Script+Interaction+with+TeamCity
        message = message
            .replace(/\|/g, `||`) // vertical bar. (must replace | first, otherwise it will affect all the following replaces as well)
            .replace(/'/g, `|'`) // apostrophe
            .replace(/\n/g, `|n`) // line feed
            .replace(/\r/g, `|r`) // carriage return
            .replace(/\[/g, `|[`) // opening bracket
            .replace(/\]/g, `|]`); // closing bracket
        return this.escapeUnicode(message);
    }

    private escapeUnicode(message: string): string {
        // replace all characters above ~ (char 126) with their unicode |0xNNNN equivalent
        return message.replace(/[^\0-~]/g, (ch: string) => `|0x${("000" + ch.charCodeAt(0).toString(16)).slice(-4)}`);
    }
}


