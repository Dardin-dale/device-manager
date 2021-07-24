/**
 * Device Task - Ensures that the device list is accurate 
 * saves relevent information to the database
 * then sends that information to the Renderer/Redux
 */

const myController = require("../db/controllers/myController");

// checkSavedParams = function(pod, savedPod){
    
// }

//Finds newly validated pods and adds them to the database.
//also updates the visibility status of pods according to the saved values
saveNewPods = async function(devices, savedPods) {
    let found = false;
    if(devices.length === 0){
        return;
    }
    for (var i=0; i < devices.length; i++){
        let pod = devices[i];
        if (savedPods.length > 0){
            for(var j=0; j < savedPods.length; j++) {
                if(pod.sn === savedPods[j].serialNumber){
                    found = true;
                    pod["id"] = savedPods[j].id;
                    //checkSavedParams(pod, savedPods[j]);
                    break;
                }
            }
        } 
        if (!found && pod) {
            let savePod = {
                serialNumber: pod.sn, 
                name: pod.sn,
            }
            let dbPod = await myController.addDevice(savePod);
            pod.id = dbPod.id;
        }
        found = false;
    }
};

//appends disconnected Pods to the device list to send to Redux.
appendDisconnectedPods = function(devices, savedPods){
    let found = false;
    if(savedPods.length === 0) {
        return;
    }
    for(var i=0; i < savedPods.length; i++){
        let savedPod = savedPods[i];
        for(var j=0; j < devices.length; j++) {
            if(savedPod.serialNumber === devices[j].sn){
                found = true;
                break;
            }
        }
        if(!found){
            //disconnected pods will not have a COM Identifier
            devices.push({
                'id': savedPod.id,
                'sn': savedPod.serialNumber,
                'name': savedPod.name,
            });
        }
        found = false;
    }
};

// makes devices accesible 
const handle_devices = async function(devices, win){
    // console.log("Devices: ", devices);
    //get devices from database
    const savedPods = await trakpodController.findAll();
    //adds newly connected pod to database.
    await saveNewPods(devices, savedPods);
    //appends disconnected pods to the device list
    //com will be null for disconnected pods.
    appendDisconnectedPods(devices, savedPods);

    //Send Pod Info to Renderer Process
    win.webContents.send('device-list', devices);
}

module.exports = handle_devices;