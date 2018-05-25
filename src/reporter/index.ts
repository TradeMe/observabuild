import { IBuildStore } from '../build-store';
import { ConsoleReporter } from './console-reporter';
import { ProgressReporter } from './progress-reporter';
import { IReporter } from './reporter';
import { isRunningInTeamCity, TeamCityReporter } from './teamcity-reporter';

export function createReporter (store: IBuildStore): IReporter {
    let reporterName: string | undefined = store.select(state => state.reporter);
    const prefixLimit: number = store.select(state => state.prefixLimit || 7);

    if (!reporterName) {
        reporterName = isRunningInTeamCity() ? 'teamcity' : 'progress';
    }
    switch (reporterName) {
        case 'teamcity':
            return new TeamCityReporter();
        case 'progress':
            return new ProgressReporter(prefixLimit, store);
        case 'console':
            return new ConsoleReporter(prefixLimit);
    }
    throw new Error(`Invalid Observabuild reporter name: ${reporterName}`);
}
