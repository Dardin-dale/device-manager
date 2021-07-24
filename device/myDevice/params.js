/**
 * Examples of parameters for Non Volitile settings for an embedded device
 */
module.exports = {
    SER_NUMBER: 0,
    LED_DRIVE: 1,
    GAIN_REF: 2,
    GAIN_PH: 3,
    REF_BLANK: 4,
    G2_BLANK: 5,

    //Use this to verify set parameter values
    isValid: function(param, value) {
        switch(param) {
            case "SER_NUMBER":
                return (value.toString().test(/[0-9a-zA-Z]{12}/));
			case "REF_BLANK":
			case 'G2_BLANK':
                return (0 <= value && value <= 4095);   
			case "LED_DRIVE": // 0-255
			case "GAIN_REF":
			case "GAIN_G2":
				return (0 <= value && value <= 255);
			default:
				return false;
			}
    }
}