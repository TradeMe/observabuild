import { ConsoleReporter } from './console-reporter';
import { ProgressReporter } from './progress-reporter';
import { IReporter } from './reporter';
import { isRunningInTeamCity, TeamCityReporter } from './teamcity-reporter';

export function createReporter (reporterName: string | undefined, prefixLimit: number): IReporter {
    if (!reporterName) {
        reporterName = isRunningInTeamCity() ? 'teamcity' : 'progress';
    }
    switch (reporterName) {
        case 'teamcity':
            return new TeamCityReporter();
        case 'progress':
            return new ProgressReporter(prefixLimit);
        case 'console':
            return new ConsoleReporter(prefixLimit);
    }
    throw new Error(`Invalid Observabuild reporter name: ${reporterName}`);
}
