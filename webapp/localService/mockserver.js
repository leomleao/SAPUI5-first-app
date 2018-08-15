sap.ui.define([
	"sap/ui/core/util/MockServer",
	"nw/epm/refapps/ext/prod/manage/localService/MockRequests"
], function(MockServer, MockRequests) {
	"use strict";

	return {
		/**
		 * Initializes the mock server. You can configure the delay with the URL parameter "serverDelay"
		 * The local mock data in this folder is returned instead of the real data for testing.
		 *
		 * @public
		 */
		init: function() {
			var oUriParameters = jQuery.sap.getUriParameters(),
				oMockServer = new MockServer({
					rootUri: "/sap/opu/odata/sap/EPM_REF_APPS_PROD_MAN_SRV/"
				}),
				oRequests = new MockRequests(oMockServer),
				sPath = jQuery.sap.getModulePath("nw.epm.refapps.ext.prod.manage.localService"),
				aRequests;

			// configure mock server with a delay of 1s
			MockServer.config({
				autoRespond: true,
				autoRespondAfter: (oUriParameters.get("serverDelay") || 0)
			});

			// load local mock data
			oMockServer.simulate(sPath + "/metadata.xml", {
				sMockdataBaseUrl: sPath + "/mockdata"
			});
			aRequests = oMockServer.getRequests();
			oMockServer.setRequests(aRequests.concat(oRequests.getRequests()));
			oMockServer.start();

			jQuery.sap.log.info("Running the app with mock data");
		}
	};
});