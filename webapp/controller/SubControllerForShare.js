// Creates a sub-controller to be used by the detail controller to handle the share dialog
sap.ui.define([
	"sap/ui/base/Object",
	"./utilities",
	"nw/epm/refapps/ext/prod/manage/model/formatter"
], function(Object, utilities, formatter) {
	"use strict";

	return Object.extend("nw.epm.refapps.ext.prod.manage.controller.SubControllerForShare", {
		formatter: formatter,
		//_oShareDialog:
		//_oParentView:
		//_oResourceBundle:
		//_oProduct:

		constructor: function(oParentView, oResourceBundle) {
			this._oParentView = oParentView;
			this._oResourceBundle = oResourceBundle;
		},

		// Opens the share dialog
		openDialog: function(oEvent) {
			var oShareButton = oEvent.getSource();
			this._oProduct = this._oParentView.getBindingContext().getObject();
			if (!this._oShareDialog) {
				this._oShareDialog = sap.ui.xmlfragment(this._oParentView.getId(), "nw.epm.refapps.ext.prod.manage.view.ShareSheet", this);
				// Switch the dialog to compact mode if the hosting view has compact mode
				utilities.attachControlToView(this._oParentView, this._oShareDialog);
			}
			this._oShareDialog.openBy(oShareButton);
		},

		onEmailPressed: function() {
			this._triggerEmail();
		},

		_triggerEmail: function() {
			sap.m.URLHelper.triggerEmail(null, this._getEmailSubject(), this._getEmailContent());
		},

		_getEmailSubject: function() {
			return this._oResourceBundle.getText("xtit.emailSubject", [this._oProduct.Name]);
		},

		_getEmailContent: function() {
			return this._oResourceBundle.getText("xtit.emailContent", [this._oProduct.Id, this._oProduct.Description,
				this._oProduct.SupplierName
			]);
		}
	});
});