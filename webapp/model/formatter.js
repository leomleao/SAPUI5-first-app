sap.ui.define([
	"sap/ui/core/format/NumberFormat",
	"sap/ui/core/format/DateFormat"
], function(NumberFormat, DateFormat) {
	"use strict";

	function fnGetServiceUrl(oController) {
		var oApplicationProperties = oController.getView().getModel("appProperties");
		return oApplicationProperties.getProperty("/serviceUrl");
	}

	var oAmountFormatter = NumberFormat.getCurrencyInstance();

	return {
		formatAvailabilityText: function(iAvailability) {
			if (iAvailability === null) {
				return "";
			}
			var sKey = iAvailability < 1 ? "xfld.outstock" : (iAvailability < 10 ? "xfld.restricted10" : "xfld.instock"),
				oBundle = this.getView().getModel("i18n").getResourceBundle();
			return oBundle.getText(sKey);
		},

		/**
		 * Formatter for Measures - Returns concatenated string with Measure and Unit
		 *
		 * @param {float}
		 *            fMeasure A measure
		 * @param {string}
		 *            sUnit A unit
		 * @returns {string} A combined textual representation of measure and unit
		 * @public
		 */
		formatMeasure: function(fMeasure, sUnit) {
			if (fMeasure === null) {
				return "";
			}
			var oBundle = this.getView().getModel("i18n").getResourceBundle();
			return oBundle.getText("xfld.formatMeasure", [fMeasure, sUnit]);
		},

		// Forms the image URL for the image GUID specified.
		// sDraftId -- Product draft ID that the new image is uploaded to.
		// Returns the relative path of the image URL.
		formatImageURL: function(sId) {
			var sPath = "";
			if (sId && typeof sId === "string") {
				sPath = fnGetServiceUrl(this) + this.getView().getModel().createKey("/ImageDrafts", {
					Id: sId
				}) + "/$value";
			}
			return sPath;
		},

		// Gets the image upload URL for the product draft specified.
		// sDraftId -- Product draft ID that the new image is uploaded to.
		// Returns the relative path of the image upload path for the product draft specified.
		getImageUploadURL: function(sDraftId) {
			var sUploadPath = "";
			if (sDraftId && typeof sDraftId === "string") {
				// sUploadPath = fnGetServiceUrl(this) + "/ProductDrafts('" + sDraftId + "')/Images";
				sUploadPath = fnGetServiceUrl(this) + this.getView().getModel().createKey("/ProductDrafts", {
					Id: sDraftId
				}) + "/Images";
			}
			return sUploadPath;
		},

		formatEditTitle: function(bIsNewObject) {
			if (bIsNewObject !== !!bIsNewObject) { // check whether bIsNewObject is boolean
				return ""; // do not set a title when no data are available
			}
			var oBundle = this.getView().getModel("i18n").getResourceBundle();
			return oBundle.getText(bIsNewObject ? "xtit.productNew" : "xtit.productEdit");
		},

		lostDraftQuestion: function(oProductDraft) {
			var oDateFormatter = DateFormat.getDateTimeInstance({
					style: "short"
				}),
				sDate = oDateFormatter.format(oProductDraft.CreatedAt),
				oBundle = this.oResourceBundle;
			// The message presented to the user depends on whether the draft is for a new product or an already existing
			// product
			return oProductDraft.IsNewProduct ? oBundle.getText("ymsg.editNewDraft", [sDate]) :
				oBundle.getText("ymsg.editDraft", [oProductDraft.Name, sDate]);
		},

		appDataForTile: function(sName) {
			return {
				title: sName
			};
		},

		// Formatter for amount
		formatAmount: function(fAmount) {
			if (!fAmount) {
				return "";
			}
			return oAmountFormatter.format(fAmount);
		}
	};
});