# device-manager
a JavaScript interface to queue commands to embedded devices. using p-queue and node-serialport.

This is an example of how to use and consume the node-serialport library for use in a Node application.

Add your devices commands to the DeviceManager and the myDevice/index.js. I've included room for Non-Volitile parameters in 
myDevice/params.js as well as some sample logic for validating those parameters.

All device commands should be run through the DeviceManager to properly queue responses from the embedded device preventing 
your application from talking over itself.

/tasking includes an example of how automate an asynchronous loop to automatically check and update the status of your embedded device.
the window in the taskSheduler is an example with a passed in BrowserWindow from Electron.