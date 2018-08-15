sap.ui.define([
	"sap/ui/Device"
], function(Device) {
	"use strict";

	// class providing static utility methods.

	// the densitiy class that should be used according to the device
	var sContentDensityClass = Device.support.touch ? "sapUiSizeCozy" : "sapUiSizeCompact";

	return {
		// provide the density class that should be used according to the device type 
		getContentDensityClass: function() {
			return sContentDensityClass;
		},

		// defines a dependency from oControl to oView
		attachControlToView: function(oView, oControl) {
			jQuery.sap.syncStyleClass(sContentDensityClass, oView, oControl);
			oView.addDependent(oControl);
		}
	};
});