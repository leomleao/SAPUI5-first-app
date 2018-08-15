sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/m/UploadCollectionParameter",
	"nw/epm/refapps/ext/prod/manage/model/formatter",
	"nw/epm/refapps/ext/prod/manage/controller/messages"
], function(Controller, UploadCollectionParameter, formatter, messages) {
	"use strict";

	function fnMessageBoxAlert(sText) {
		sap.ui.require(["sap/m/MessageBox", "nw/epm/refapps/ext/prod/manage/controller/utilities"], function(MessageBox, utilities) {
			MessageBox.alert(sText, {
				styleClass: utilities.getContentDensityClass()
			});
		});
	}

	return Controller.extend("nw.epm.refapps.ext.prod.manage.controller.ProductDraftUploadImages", {
		formatter: formatter,
		// _oControlUploadImage
		// _oDataHelper
		// _oResourceBundle
		// _fnSetDraftDirty

		onInit: function() {
			this._oControlUploadImage = this.byId("Upload_Images");
		},

		// This handler is called if the file mismatches the given file type
		onFileTypeMismatch: function(oEvent) {
			var ofileType = oEvent.getParameters().getParameter("fileType");
			fnMessageBoxAlert(this._oResourceBundle.getText("ymsg.fileTypeMismatch", ofileType));
		},

		// This handler is called after the upload request is completed
		onUploadCompleted: function(oEvent) {
			var oResponse = oEvent.getParameters();
			// Status code 201: image is created/uploaded
			if (oResponse.getParameter("status") === 201) {
				this._fnSetDraftDirty();
			} else {
				var oError = oResponse.getParameter("responseRaw");
				messages.showXMLErrorMessage(oError, this.getView());
			}
			this._oControlUploadImage.getBinding("items").refresh();
		},

		// User chooses the Delete icon
		onImageDelete: function(oEvent) {
			var sImageId = oEvent.getParameters().documentId;
			var sPath = this.getView().getModel().createKey("/ImageDrafts", {
				Id: sImageId
			});
			this._oDataHelper.deleteImageDraft(sPath, function() {
				this._fnSetDraftDirty();
				this._oControlUploadImage.getBinding("items").refresh();
			}.bind(this));
		},

		// This Handler is called after the user selects the image to be uploaded and still before the image is sent
		// to the backend. For a successful file uploading, the security (XSRF) token needs to be provided for the Gateway,
		// currently it needs to set (or updated if the upload has been done once) manually by the application.
		// Note: the token is set usually automatically by the oDataModel for the native oData operations, such as CRUD and
		// function import operations.                         
		onChange: function() {
			// Gets the latest token form the oDataModel
			var fnSetSecurityTokenInHeader = function() {
				var sCSRFToken = this.getView().getModel().getSecurityToken(),
					bFound = false,
					aHeaderParameters = this._oControlUploadImage.getHeaderParameters();
				// Finds the HTTP request header with "x-csrf-token", if found, updates the value to the latest one.
				if (aHeaderParameters) {
					for (var i = 0; i < aHeaderParameters.length; i++) {
						if (aHeaderParameters[i].getName() === "x-csrf-token") {
							bFound = true;
							aHeaderParameters[i].setValue(sCSRFToken);
							break;
						}
					}
				}
				// If the HTTP request header with "x-csrf-token" has not yet been set, the corresponding new header has to
				// be included.
				if (!bFound) {
					this._oControlUploadImage.addHeaderParameter(new UploadCollectionParameter({
						name: "x-csrf-token",
						value: sCSRFToken
					}));
				}
			}.bind(this);
			this._whenSecurityToken(fnSetSecurityTokenInHeader);
		},

		// Sets the data provided by the parent controller
		setInitData: function(oSettings) {
			this._oDataHelper = oSettings.oDataHelper;
			this._fnSetDraftDirty = oSettings.fnDirty;
			this._oResourceBundle = oSettings.oResourceBundle;
		},

		// Gets the latest security token from the server and executes a given function afterwards
		_whenSecurityToken: function(fnWithSecurityToken) {
			this.getView().getModel().refreshSecurityToken(fnWithSecurityToken, function() {
				fnMessageBoxAlert(this._oResourceBundle.getText("ymsg.securityTokenNotRetrieved"));
			}.bind(this));
		}
	});
});