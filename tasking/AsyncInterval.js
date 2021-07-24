/**
 * 
 * This class is designed to implement a interval loop that 
 * will run ascynchronous code as close to the set interval as possible
 * based on npm set-interval-async's dynamic async interval
 * 
 */

/**
 * Timer object returned by setIntervalAsync.<br>
 * Can be used together with {@link clearAsyncInterval} to stop execution.
 */
class SetAsyncIntervalTimer {
    constructor () {
      this.stopped = false
      this.id = 0
      this.timeouts = {}
      this.promises = {}
    }
  }

 /**
  * 
  * @param {function} handler - asynchronous function to be executed
  * @param {number} interval - time in milliseconds. minimum 10 ms 
  * @param  {...any} args 
  * @returns {SetAsyncIntervalTimer} - timer that can be used to clear the interval {@link clearAsyncInterval}
  */
 function setAsyncInterval (handler, interval, ...args) {
    if(typeof handler !== 'function'){
        throw new Error("Invalid argument: handler. Expected function");
    }
    if(typeof interval !== 'number' && interval <= 10) {
        throw new Error("Invalid argument: interval. must be a number greater than 10ms");
    }
    const timer = new SetAsyncIntervalTimer();
    const id = timer.id
    timer.timeouts[id] = setTimeout(timeoutHandler, interval, timer, handler, interval, ...args);
    return timer;
 }

 //Executes function as close to interval as possible
 // with a 2 second delay for TrakPods this should last 8.5 years before running into issues.
 function timeoutHandler (timer, handler, interval, ...args) {
    const id = timer.id
    timer.promises[id] = (async () => {
        const startTime = new Date();
        try {
        await handler(...args);
        } catch (err) {
        console.error(err);
        }
        const endTime = new Date();
        if (!timer.stopped) {
        const executionTime = endTime - startTime;
        const timeout = interval > executionTime
            ? interval - executionTime
            : 0
        timer.timeouts[id + 1] = setTimeout(
            timeoutHandler,
            timeout,
            timer,
            handler,
            interval,
            ...args
        )
        }
        delete timer.timeouts[id]
        delete timer.promises[id]
    })();
    timer.id = id + 1
}

//const MAX_INTERVAL_MS = Math.pow(2, 31) - 1

/**
 * Clears timeouts and promises that remian in the interval.
 * @param {SetAsyncIntervalTimer} timer 
 * @returns {Promise} 
 */
async function clearAsyncInterval(timer) {
    timer.stopped = true
    for (const timeout of Object.values(timer.timeouts)) {
        clearTimeout(timeout)
    }
    const noop = () => {}
    const promises = Object
    .values(timer.promises)
    .map(
        (promise) => {
        promise.catch(noop)
        }
    )
    //const noopInterval = setInterval(noop, MAX_INTERVAL_MS) - IDK what this accomplishes -LC
    await Promise.all(promises)
    //clearInterval(noopInterval)
}

module.exports = {setAsyncInterval, clearAsyncInterval}