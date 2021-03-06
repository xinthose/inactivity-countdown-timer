import {
    InactivityCountdownTimer,
    IInactivityConfig,
    IInactivityDependencies, isNumberNotNan
} from "../src/inactivity-countdown-timer";
import 'core-js/features/object/assign';
export type Spied<T> = { [Method in keyof T]: jasmine.Spy };

describe('Inactivity countdown timer', () => {
    function setup(params?: IInactivityConfig, deps?: IInactivityDependencies): {ict: InactivityCountdownTimer} {
        const ict = new InactivityCountdownTimer({}, deps);
        ict.setup(params);
        return {ict};
    }

    function setupAndStart(params?: IInactivityConfig, deps?: IInactivityDependencies): {ict: InactivityCountdownTimer} {
        const {ict} = setup(params, deps);
        ict.start();
        return {ict};
    }

    function setupAndStartWithClock(params: IInactivityConfig, deps?: IInactivityDependencies): {ict: InactivityCountdownTimer} {
        jasmine.clock().install();
        jasmine.clock().mockDate();
        return setupAndStart(params, deps);
    }

    function cleanupWithClock(ict: InactivityCountdownTimer): void {
        ict.cleanup();
        ict = null;
        jasmine.clock().uninstall();
    }

    describe('construction', () => {
        it('logs to the console when the idleTimeoutTime is smaller than the startCountdownTimerAt value', () => {
            const log = spyOn(window.console, 'log');
            const {ict} = setupAndStart({startCountDownTimerAt: 20000, idleTimeoutTime: 10000});
            ict.cleanup();
            expect(log).toHaveBeenCalledWith('startCountdown time must be smaller than idleTimeoutTime, setting to idleTimeoutTime')
        });

        it('attaches event handlers to document.click, document.mousemove, document.keypress, window.load when none are passed in', () => {
            const documentAttachEventSpy = spyOn(document, 'addEventListener').and.callThrough();
            const windowAttachEventSpy = spyOn(window, 'addEventListener').and.callThrough();
            const {ict} = setupAndStart();
            ['click', 'mousemove', 'keypress'].forEach((event) => {
                expect(documentAttachEventSpy).toHaveBeenCalledWith(event, ict as any, false);
            });
            expect(windowAttachEventSpy).toHaveBeenCalledWith('load', ict as any, false);
            ict.cleanup();
        });

        it('Attaches custom event handlers to document and window when they are passed in', () => {
            const documentAttachEventSpy = spyOn(document, 'addEventListener').and.callThrough();
            const windowAttachEventSpy = spyOn(window, 'addEventListener').and.callThrough();
            const {ict} = setupAndStart({resetEvents: ['scroll','dblclick'], windowResetEvents: ['blur']});
            ['scroll', 'dblclick'].forEach((event) => {
                expect(documentAttachEventSpy).toHaveBeenCalledWith(event, ict as any, false);
            });
            expect(windowAttachEventSpy).toHaveBeenCalledWith('blur', ict as any, false);
            ict.cleanup();
        });
    });

    describe('requires a number for idle timeout time, sets a default if none provided', () => {
        it('sets a reasonable default if maths fails to pass a number', () => {
            const params = {
                idleTimeoutTime: parseInt('aaa', 10),
            };
            const deps = {
                logger: jasmine.createSpyObj(['log'])
            };
            const {ict} = setupAndStart(params, deps);

            const thirtyMinutes = 30 * 60 * 1000;
            expect(ict['idleTimeoutTime']).toEqual(thirtyMinutes);
            expect(deps.logger.log).toHaveBeenCalledWith('idleTimeoutTime passed was not a number, setting to 30 minutes');

            ict.cleanup();
        })
    });

    describe('start', () => {
        it('sets the status to started from stopped', () => {
            const ict = new InactivityCountdownTimer();
            expect(ict.status).toEqual('stopped');
            ict.start();
            expect(ict.status).toEqual('started');
            expect(ict.started).toBe(true);
            expect(ict.stopped).toBe(false);
            ict.cleanup();
        });
    });

    describe('stop', () => {
        it('sets the status to stopped from started', () => {
            const {ict} = setupAndStart();
            expect(ict.status).toEqual('started');
            ict.stop();
            expect(ict.status).toEqual('stopped');
            expect(ict.stopped).toBe(true);
            expect(ict.started).toBe(false);
            ict.cleanup();
        });
    });

    describe('cleanup removing event listeners -', () => {
        it('removes event listeners and clears timers when .cleanup is called', () => {
            const documentRemoveEventSpy = spyOn(document, 'removeEventListener').and.callThrough();
            const windowRemoveEventSpy = spyOn(window, 'removeEventListener').and.callThrough();
            const clearInterval = spyOn(window, 'clearInterval').and.callThrough();
            const clearTimeout = spyOn(window, 'clearTimeout').and.callThrough();

            const {ict} = setupAndStart({
                resetEvents: ['click', 'mousemove'],
                windowResetEvents: ['blur', 'load'],
                throttleDuration: 1000
            });

            ict.handleEvent('click' as any);

            ict.cleanup();
            ['click', 'mousemove'].forEach((event) => {
                expect(documentRemoveEventSpy).toHaveBeenCalledWith(event, ict as any, false);
            });

            ['blur', 'load'].forEach((event) => {
                expect(windowRemoveEventSpy).toHaveBeenCalledWith(event, ict as any, false);
            });

            expect(clearTimeout).toHaveBeenCalledWith(ict['throttleTimeoutId']);
            expect(clearInterval).toHaveBeenCalledWith(ict['idleIntervalId']);
        })
    });

    describe('timing out -', () => {
        it('calls the params.timeoutCallback if one was passed in', () => {
            const callback = jasmine.createSpy('callback');
            const {ict} = setupAndStartWithClock({idleTimeoutTime: 2000, timeoutCallback: callback});
            expect(callback).not.toHaveBeenCalled();
            jasmine.clock().tick(2001);
            expect(callback).toHaveBeenCalled();
            cleanupWithClock(ict)
        });

        it('cleanups event listeners the idleTimeout is finished', () => {
            const {ict} = setupAndStartWithClock({idleTimeoutTime: 2000});
            // we need to call through so the interval timer stops watching
            const cleanup = spyOn(ict, 'cleanup').and.callThrough();
            expect(cleanup).not.toHaveBeenCalled();
            jasmine.clock().tick(2001);
            expect(cleanup).toHaveBeenCalled();
            cleanupWithClock(ict);
        });

        it(`resets the timeout time if one of the event handlers get's called`, () => {
            ['click', 'mousemove', 'keypress'].forEach(() => {
                const {ict} = setupAndStartWithClock({idleTimeoutTime: 2000});
                // we need to call through so the interval timer stops watching
                const timeout = spyOn(ict, 'timeout' as any).and.callThrough();
                jasmine.clock().tick(1001); // 1001 total time
                expect(timeout).not.toHaveBeenCalled();
                dispatchMouseEvent('click'); // timer will reset and initialise at 2000
                jasmine.clock().tick(1000); // 2001 total time
                expect(timeout).not.toHaveBeenCalled();
                jasmine.clock().tick(4000); // 3001
                expect(timeout).toHaveBeenCalledTimes(1);
                cleanupWithClock(ict)
            });
        });
    });

    describe('counting down - ', () => {
        it('calls the params.countDownCallback when the time reaches the startCountdownTimerAt value', () => {
            const callback = jasmine.createSpy('callback');
            const settings: IInactivityConfig = {
                idleTimeoutTime: 20000,
                startCountDownTimerAt: 10000,
                countDownCallback: callback
            };
            const {ict} = setupAndStartWithClock(settings);
            jasmine.clock().tick(9000);
            expect(callback).not.toHaveBeenCalled();
            jasmine.clock().tick(1000);
            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith(10);
            jasmine.clock().tick(1000);
            expect(callback).toHaveBeenCalledTimes(2);
            expect(callback).toHaveBeenCalledWith(9);
            jasmine.clock().tick(1000);
            expect(callback).toHaveBeenCalledWith(8);
            expect(callback).toHaveBeenCalledTimes(3);
            cleanupWithClock(ict)
        });

        it('calls the params.countDownCancelledCallback when the countdown is aborted', () => {
            const countDownCallback = jasmine.createSpy('countDownCallback');
            const countDownCancelledCallback = jasmine.createSpy('countDownCancelledCallback');
            const settings: IInactivityConfig = {
                idleTimeoutTime: 20000,
                startCountDownTimerAt: 10000,
                countDownCallback: countDownCallback,
                countDownCancelledCallback: countDownCancelledCallback
            };
            const {ict} = setupAndStartWithClock(settings);
            jasmine.clock().tick(9000);
            expect(countDownCallback).not.toHaveBeenCalled();
            jasmine.clock().tick(1000);
            expect(countDownCallback).toHaveBeenCalledWith(10);
            jasmine.clock().tick(1000);
            expect(countDownCallback).toHaveBeenCalledWith(9);
            dispatchMouseEvent('click'); // timer will reset and initialise at 20000
            jasmine.clock().tick(2000);
            expect(countDownCancelledCallback).toHaveBeenCalled();
            cleanupWithClock(ict)
        });
    });

    describe('timeoutPrecision', () => {
        it('dynamically adjust the timeout precision', () => {
            const countDownCallback = jasmine.createSpy('countDownCallback');
            const settings: IInactivityConfig = {
                idleTimeoutTime: 1000 * 60 * 5, // 5 minutes
                startCountDownTimerAt: 1000 * 30, // 30 seconds
                countDownCallback: countDownCallback
            };
            const {ict} = setupAndStartWithClock(settings);
            const fourMins = 1000 * 60 * 4;
            const twentyNineSeconds = 1000 * 29;
            // should call countdown callback only once at 4:30
            // then every second
            jasmine.clock().tick(fourMins + twentyNineSeconds); // 4:29
            expect(countDownCallback).not.toHaveBeenCalled();
            jasmine.clock().tick(1000); // 4:30 seconds
            expect(countDownCallback).toHaveBeenCalledTimes(1);
            jasmine.clock().tick(1000); // 4:31 seconds
            expect(countDownCallback).toHaveBeenCalledTimes(2);
            jasmine.clock().tick(1000); // 4:32 seconds
            expect(countDownCallback).toHaveBeenCalledTimes(3);
            dispatchMouseEvent('click'); // timer will reset and initialise at 5 mins
            expect(countDownCallback).toHaveBeenCalledTimes(3);
            jasmine.clock().tick(fourMins + twentyNineSeconds); // 4:29
            expect(countDownCallback).toHaveBeenCalledTimes(3);
            jasmine.clock().tick(1000); // 4:30
            expect(countDownCallback).toHaveBeenCalledTimes(4);
            cleanupWithClock(ict);
        });
    });

    describe('throttle', () => {
        it('throttles the handle event function when a throttle value is passed in', () => {
            const settings: IInactivityConfig = {
                idleTimeoutTime: 1000 * 60 * 5, // 5 minutes
                startCountDownTimerAt: 1000 * 30, // 30 seconds
                throttleDuration: 1000 * 30, // 30 seconds
            };
            const {ict} = setupAndStartWithClock(settings);
            const handleEventSpy = spyOn(ict, 'handleEvent').and.callThrough();

            jasmine.clock().tick(15000); // 15 seconds
            dispatchMouseEvent('click'); // event will trigger handleEvent and reset the timer
            expect(handleEventSpy).toHaveBeenCalledTimes(1);

            jasmine.clock().tick(29000); // 29 seconds after click handleEvent will not be triggered as it is throttled
            dispatchMouseEvent('click'); // nothing!
            expect(handleEventSpy).not.toHaveBeenCalledTimes(2);

            jasmine.clock().tick(1000); // 30 seconds clock will
            dispatchMouseEvent('click'); // timer will reset and initialise
            expect(handleEventSpy).toHaveBeenCalledTimes(2);

            jasmine.clock().tick(31000); // 31 more seconds clock will reset again;
            dispatchMouseEvent('click'); // timer will reset and initialise
            expect(handleEventSpy).toHaveBeenCalledTimes(3);
            cleanupWithClock(ict);
        });

        it('ignores a throttle duration large than 1/5th the timeout time', () => {
            const log = spyOn(window.console, 'log');

            const settings: IInactivityConfig = {
                idleTimeoutTime: 1000 * 60 * 5, // 5 minutes
                startCountDownTimerAt: 1000 * 30, // 30 seconds
                throttleDuration: 1000 * 60, // 30 seconds
            };
            const {ict} = setupAndStartWithClock(settings);
            const handleEventSpy = spyOn(ict, 'handleEvent').and.callThrough();

            expect(log).toHaveBeenCalledWith('throttle time must be smaller than 1/5th timeout time: 270000 setting to 54000ms');
            jasmine.clock().tick(1000);
            dispatchMouseEvent('click'); // event will trigger handleEvent and reset the timer
            expect(handleEventSpy).toHaveBeenCalledTimes(1);

            jasmine.clock().tick(53000); // 53 seconds after click handleEvent will not be triggered as it is throttled
            dispatchMouseEvent('click'); // nothing!
            expect(handleEventSpy).not.toHaveBeenCalledTimes(2);

            jasmine.clock().tick(1000); // 54 seconds after click handleEvent will not be triggered as it is throttled
            dispatchMouseEvent('click');
            expect(handleEventSpy).toHaveBeenCalledTimes(2);

            cleanupWithClock(ict);
        })
    });

    describe('localstorage - ', () => {
        it('reacts to updates by other windows through local storage', () => {
            const callback = jasmine.createSpy('callback');
            const localStorageKey = 'idleTimeoutTimeKey';
            const settings = {
                idleTimeoutTime: 5000,
                timeoutCallback: callback,
                localStorageKey: localStorageKey
            };
            const {ict} = setupAndStartWithClock(settings);
            jasmine.clock().tick(4000);
            expect(callback).not.toHaveBeenCalled();
            // reset the time
            const currentMockTime = (new Date()).getTime().toString();
            localStorage.setItem(localStorageKey,currentMockTime);
            jasmine.clock().tick(4000);
            expect(callback).not.toHaveBeenCalled();
            jasmine.clock().tick(5000);
            expect(callback).toHaveBeenCalled();
            cleanupWithClock(ict)
        });

        it('logs a message when local storage is not available', () => {
            spyOn(console, 'log');
            // see this issue for storage.prototype https://github.com/jasmine/jasmine/issues/299;
            spyOn(Storage.prototype, 'setItem').and.throwError('some error');
            const {ict} = setup({});
            const expectedMessage = 'LOCAL STORAGE IS NOT AVAILABLE FOR SYNCING TIMEOUT ACROSS TABS';
            expect(console.log).toHaveBeenCalledWith(expectedMessage, jasmine.any(Error));
            ict.cleanup();
        });

        it('works even without local storage', () => {
            const countDownCallback = jasmine.createSpy('countDownCallback');
            const countDownCancelledCallback = jasmine.createSpy('countDownCancelledCallback');
            const settings: IInactivityConfig = {
                idleTimeoutTime: 20000,
                startCountDownTimerAt: 10000,
                countDownCallback: countDownCallback,
                countDownCancelledCallback: countDownCancelledCallback
            };
            const {ict} = setupAndStartWithClock(settings, {localStorage: null});
            jasmine.clock().tick(9000);
            expect(countDownCallback).not.toHaveBeenCalled();
            jasmine.clock().tick(1000);
            expect(countDownCallback).toHaveBeenCalledWith(10);
            jasmine.clock().tick(1000);
            expect(countDownCallback).toHaveBeenCalledWith(9);
            dispatchMouseEvent('click'); // timer will reset and initialise at 20000
            jasmine.clock().tick(2000);
            expect(countDownCancelledCallback).toHaveBeenCalled();
            cleanupWithClock(ict);
        })
    });

    describe('isNumberNotNull', () => {
        it('returns true for a number', () => {
            const result = isNumberNotNan(10);
            expect(result).toBe(true);
            const result2 = isNumberNotNan(0);
            expect(result2).toBe(true);
        });

        it('returns false for NaN', () => {
            // type of NaN is a number :(
            const result = isNumberNotNan(NaN);
            expect(result).toBe(false);
        });

        it('returns false for other values', () => {
            // type of NaN is a number :(
            const result = isNumberNotNan({});
            expect(result).toBe(false);

            const result2 = isNumberNotNan('');
            expect(result2).toBe(false);

            const result3 = isNumberNotNan(false);
            expect(result3).toBe(false);
        })
    });
});

// see this link for eventClasses https://developer.mozilla.org/en-US/docs/Web/API/Document/createEvent#Notes
function dispatchMouseEvent(eventName: string): void {
    // http://stackoverflow.com/questions/2490825/how-to-trigger-event-in-javascript
    const eventClass: string = 'MouseEvents';
    let docEvent: Event;
    if(document.createEvent){
        docEvent = document.createEvent(eventClass);
        docEvent.initEvent(eventName, true, true);
    }
    else {
        docEvent = eventName as any;
    }
    // @ts-ignore
    dispatchEvent(document, docEvent);
}

function dispatchEvent(element: any, event: Event): void {
    if(element['dispatchEvent']){
        element.dispatchEvent(event, true)
    } else if(element['fireEvent']){
        element.fireEvent('on' + event); // ie8 fix
    } else {
        throw new Error('No dispatch event method in browser')
    }
}
