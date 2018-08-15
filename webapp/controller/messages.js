sap.ui.define([
	"sap/m/MessageBox",
	"sap/ui/model/json/JSONModel",
	"./utilities"
], function(MessageBox, JSONModel, utilities) {
	"use strict";

	function fnExtractErrorMessageFromDetails(sDetails) {
		if (jQuery.sap.startsWith(sDetails || "", "{\"error\":")) {
			var oErrModel = new JSONModel();
			oErrModel.setJSON(sDetails);
			return oErrModel.getProperty("/error/message/value") || "Error";
		}
	}

	function fnParseError(oParameter) {
		var oParameters = null,
			oResponse = null,
			oError = {};

		// "getParameters": for the case of catching oDataModel "requestFailed" event
		oParameters = oParameter.getParameters ? oParameter.getParameters() : null;
		// "oParameters.response": V2 interface, response object is under the getParameters()
		// "oParameters": V1 interface, response is directly in the getParameters()
		// "oParameter" for the case of catching request "onError" event
		oResponse = oParameters ? (oParameters.response || oParameters) : oParameter;
		oError.sDetails = oResponse.responseText || oResponse.body || (oResponse.response && oResponse.response.body) || ""; //"onError" Event: V1 uses response and response.body
		oError.sMessage = fnExtractErrorMessageFromDetails(oError.sDetails) || oResponse.message || (oParameters && oParameters.message);
		return oError;
	}

	function fnShowMessageBox(sTitle, sMessageHeader, sMessageDetails) {

		MessageBox.show(sMessageHeader, {
			icon: MessageBox.Icon.ERROR,
			title: sTitle,
			details: sMessageDetails,
			actions: MessageBox.Action.CLOSE,
			styleClass: utilities.getContentDensityClass()
		});

	}

	return {
		// Show an error dialog with information from the oData response object.
		// oParameter - The object containing error information
		showErrorMessage: function(oParameter, oView) {
			var oErrorDetails = fnParseError(oParameter),
				oBundle = oView.getModel("i18n").getResourceBundle(),
				sTitle = oBundle.getText("xtit.error");
			fnShowMessageBox(sTitle, oErrorDetails.sMessage, oErrorDetails);
			/*
			MessageBox.show(oErrorDetails.sMessage, {
				icon: MessageBox.Icon.ERROR,
				title: sTitle,
				details: oErrorDetails.sDetails,
				actions: MessageBox.Action.CLOSE,
				styleClass: utilities.getContentDensityClass()
			});*/
		},

		showXMLErrorMessage: function(oParameter, oView) {
			// Errors from upload control are in xml format as default because the requests expect other formats 
			// in the header for pictures

			// xml is parsed using jQuery, then passed to jQuery object
			try {
				var xmlDoc = jQuery.parseXML(oParameter);
				var xml = jQuery(xmlDoc);
			} catch (e) {
				jQuery.sap.log.error(e);
			}

			if (xml) {
				var sMessageHeader = xml.find("errordetails").find("message").text();
				var sMessageDetails = xml.find("error").find("message").text();
			} else {
				// Just in case that the Error from request could not be parsed
				sMessageHeader = oParameter;
			}

			var oBundle = oView.getModel("i18n").getResourceBundle(),
				sTitle = oBundle.getText("xtit.error");
			fnShowMessageBox(sTitle, sMessageHeader, sMessageDetails);
		},

		getErrorContent: function(oParameter) {
			return fnParseError(oParameter).sMessage;
		},

		getErrorDetails: function(oParameter) {
			return fnParseError(oParameter).sDetails;
		},

		extractErrorMessageFromDetails: function(sDetails) {
			return fnExtractErrorMessageFromDetails(sDetails);
		}
	};
});