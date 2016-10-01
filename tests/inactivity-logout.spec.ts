require('./ie8forEachPolyfill'); // because we use forEach in this test
import {InactivityLogout} from '../src/inactivity-logout'
import {IInactivityConfigParams} from '../src/inactivity-logout'
// need to install jasmine clock and mock the date for testing
describe('Inactivity logout -', () => {

    describe('Setup -', () => {
        it('should log to the console when the idleTimeoutTime is smaller than the startCountdownTimerAt value', () => {
            let log = spyOn(window.console, 'log');
            let IL = new InactivityLogout({startCountDownTimerAt: 20000, idleTimeoutTime: 10000});
            IL.cleanup();
            IL = null;
            expect(log).toHaveBeenCalledWith('startCountdown time must be smaller than idleTimeoutTime, setting to idleTimeoutTime')
        });

        it('should attach event handlers to document.click, document.mousemove, document.keypress, window.load', () => {
            let documentAttachEventSpy = spyOn(document, 'addEventListener').and.callThrough();
            let windowAttachEventSpy = spyOn(window, 'addEventListener').and.callThrough();
            let IL = new InactivityLogout();
            ['click', 'mousemove', 'keypress'].forEach((event) => {
                expect(documentAttachEventSpy).toHaveBeenCalledWith(event, IL, false);
            });
            expect(windowAttachEventSpy).toHaveBeenCalledWith('load', IL, false);
            IL.cleanup();
            IL = null;
        });

        // todo: test that cleanup removes the event listeners

    });

    describe('timing out -', () => {
        it('should call timeout when the idleTimeout is finished', () => {
            let IL = setupWithClock({idleTimeoutTime: 2000});
            // we need to call through so the interval timer stops watching
            let timeout = spyOn(IL, 'timeout').and.callThrough();
            expect(timeout).not.toHaveBeenCalled();
            jasmine.clock().tick(2001);
            expect(timeout).toHaveBeenCalled();
            cleanupWithClock(IL);
        });

        it('should reset the idleTimeout if one of the event handlers get\s called', () => {
            ['click', 'mousemove', 'keypress'].forEach(() => {
                let IL = setupWithClock({idleTimeoutTime: 2000});
                // we need to call through so the interval timer stops watching
                let timeout = spyOn(IL, 'timeout').and.callThrough();
                jasmine.clock().tick(1001); // 1001 total time
                expect(timeout).not.toHaveBeenCalled();
                dispatchMouseEvent('click'); // timer will reset and initialise at 2000
                jasmine.clock().tick(1000); // 2001 total time
                expect(timeout).not.toHaveBeenCalled();
                jasmine.clock().tick(4000); // 3001
                expect(timeout).toHaveBeenCalledTimes(1);
                cleanupWithClock(IL)
            });
        });
    });

    describe('countdown - ', () => {
        it('should start calling the countdown timer callback when the time reaches the startCountdownTimerAt value', () => {
            let callback = jasmine.createSpy('callback');
            let settings: IInactivityConfigParams = {
                idleTimeoutTime: 20000,
                startCountDownTimerAt: 10000,
                countDownCallback: callback
            };
            let IL = setupWithClock(settings);
            jasmine.clock().tick(9000);
            expect(callback).not.toHaveBeenCalled();
            jasmine.clock().tick(1000);
            expect(callback).toHaveBeenCalledWith(10);
            jasmine.clock().tick(1000);
            expect(callback).toHaveBeenCalledWith(9);
            jasmine.clock().tick(1000);
            expect(callback).toHaveBeenCalledWith(8);
            expect(callback).toHaveBeenCalledTimes(3);
            cleanupWithClock(IL)
        });

        it('should call a countdown cancelled callback when the countdown is aborted', () => {
            let countDownCallback = jasmine.createSpy('countDownCallback');
            let countDownCancelledCallback = jasmine.createSpy('countDownCancelledCallback');
            let settings: IInactivityConfigParams = {
                idleTimeoutTime: 20000,
                startCountDownTimerAt: 10000,
                countDownCallback: countDownCallback,
                countDownCancelledCallback: countDownCancelledCallback
            };
            let IL = setupWithClock(settings);
            jasmine.clock().tick(9000);
            expect(countDownCallback).not.toHaveBeenCalled();
            jasmine.clock().tick(1000);
            expect(countDownCallback).toHaveBeenCalledWith(10);
            jasmine.clock().tick(1000);
            expect(countDownCallback).toHaveBeenCalledWith(9);
            dispatchMouseEvent('click'); // timer will reset and initialise at 20000
            jasmine.clock().tick(2000);
            expect(countDownCancelledCallback).toHaveBeenCalled();
            cleanupWithClock(IL)
        })
    });

    describe('redirection - ', () => {
        it('should redirect when the timeout expires if a url was passed in', () => {
            let IL = setupWithClock({idleTimeoutTime: 2000, logoutHREF: 'logout.html'});
            let redirectFunction = spyOn(IL, 'redirect');
            expect(redirectFunction).not.toHaveBeenCalledWith('logout.html');
            jasmine.clock().tick(2001);
            expect(redirectFunction).toHaveBeenCalledWith('logout.html');
            cleanupWithClock(IL)
        });

        it('should not redirect when the timeout expires if a url was not passed in', () => {
            let IL = setupWithClock({idleTimeoutTime: 2000});
            let redirectFunction = spyOn(IL, 'redirect');
            jasmine.clock().tick(2001);
            expect(redirectFunction).not.toHaveBeenCalledWith('logout.html');
            cleanupWithClock(IL)
        });
    });

    describe('callback - ', () => {
        it('should execute a callback when the timeout expires if a callback was passed in', () => {
            let callback = jasmine.createSpy('callback');
            let IL = setupWithClock({idleTimeoutTime: 2000, timeoutCallback: callback});
            expect(callback).not.toHaveBeenCalled();
            jasmine.clock().tick(2001);
            expect(callback).toHaveBeenCalled();
            cleanupWithClock(IL)
        });
    });

    describe('localstorage - ', () => {
        it('should react to updates by other windows through local storage', () => {
            let callback = jasmine.createSpy('callback');
            let localStorageKey = 'idleTimeoutTimeKey';
            let settings = {
                idleTimeoutTime: 5000,
                timeoutCallback: callback,
                localStorageKey: localStorageKey
            };
            let IL = setupWithClock(settings);
            jasmine.clock().tick(4000);
            expect(callback).not.toHaveBeenCalled();
            // reset the time
            let currentMockTime = (new Date()).getTime().toString();
            localStorage.setItem(localStorageKey,currentMockTime);
            jasmine.clock().tick(4000);
            expect(callback).not.toHaveBeenCalled();
            jasmine.clock().tick(5000);
            expect(callback).toHaveBeenCalled();
            cleanupWithClock(IL)
        })
    })

});

function setupWithClock(params: IInactivityConfigParams): InactivityLogout {
    jasmine.clock().install();
    jasmine.clock().mockDate();
    return new InactivityLogout(params);
}

function cleanupWithClock(IL: InactivityLogout): void {
    IL.cleanup();
    IL = null;
    jasmine.clock().uninstall();
}
// see this link for eventClasses https://developer.mozilla.org/en-US/docs/Web/API/Document/createEvent#Notes
function dispatchMouseEvent(eventName: string): void {
    // http://stackoverflow.com/questions/2490825/how-to-trigger-event-in-javascript
    let eventClass: string = 'MouseEvents';
    let docEvent: any;
    if(document.createEvent){
        docEvent = document.createEvent(eventClass);
        docEvent.initEvent(eventName, true, true);
    } else {
        docEvent = eventName;
    }
    dispatchEvent(document, docEvent);
}

// IE8 fix for tests
function dispatchEvent(element: any, event: Event): void {
    if(element['dispatchEvent']){
        element.dispatchEvent(event, true)
    } else if(element['fireEvent']){
        element.fireEvent('on' + event); // ie8 fix
    } else {
        throw new Error('No dispatch event method in browser')
    }
}