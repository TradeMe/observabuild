import { ConsoleReporter } from './console-reporter';
import { IReporter } from './reporter';
import { isRunningInTeamCity, TeamCityReporter } from './teamcity-reporter';

export function createReporter (reporterName: string | undefined, prefixLimit: number): IReporter {
    if (!reporterName) {
        reporterName = isRunningInTeamCity() ? 'teamcity' : 'console';
    }
    switch (reporterName) {
        case 'teamcity':
            return new TeamCityReporter();
        case 'console':
            return new ConsoleReporter(prefixLimit);
    }
    throw new Error(`Invalid Observabuild reporter name: ${reporterName}`);
}
