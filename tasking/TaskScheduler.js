/**
 * Task Scheduler used to perform initiation tasks.
 * 
 * includes: Device population
 * 
 * uses the main device manager instance to prevent cross talk.
 * 
 */

const DeviceManager = require('../device/DeviceManager');
const {setAsyncInterval, clearAsyncInterval} = require("./AsyncInterval");
const handle_devices = require("./devicesTask");
 
/**
 * This is the main task scheduler to 
 * @param {DeviceManager} deviceManager - The single instance of the device manager to talk to TrakPods
 * @param {BrowserWindow} win - The main rendered window for the app
 */
var scheduleTasks = function(win) {
        const deviceManager = DeviceManager.getInstance();
        let devices = []; // up to date device list
        
        /**
         * Interval to grab devices from the Device Manager
        */
        const deviceInterval = setAsyncInterval(async () => {
            devices = await deviceManager.getDevices();
            await handle_devices(devices, win);
        }, 3000);
    
        //ensure intervals cleared on window close.
        win.on('closed', function(){
            clearAsyncInterval(deviceInterval);
        });
}

 module.exports = scheduleTasks;