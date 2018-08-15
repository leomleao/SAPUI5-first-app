// Helper class for nw.epm.refapps.products.manage.model.Products. It provides generic handling when the UI5 OData
// DELETE service is called. The public functions in this class should give business semantics for the application (such
// as DELETE product(s), DELETE product draft, DELETE product image, with or without user confirmation). Currently the
// Products class uses this class by creating a transient instance on demand in order to execute exactly one (public)
// method of this class. However, this class is agnostic about this pattern. Note that instances of this class are
// created on demand (that is, immediately before the required public method of this class is executed) and garbage
// collected.
//
// Note that the entities to be deleted are always specified by paths (strings) in the OData model. For convenience,
// this class is tolerant on whether the path starts with "/" or not. See function fnGetPathWithSlash.
sap.ui.define([
	"sap/ui/base/Object",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"nw/epm/refapps/ext/prod/manage/controller/utilities"
], function(Object, MessageBox, MessageToast, utilities) {
	"use strict";

	// Normalization of OData-paths (puts a "/" in front of the path if it is not already there)
	function fnGetPathWithSlash(sPath) {
		return (sPath.indexOf("/") === 0 ? "" : "/") + sPath;
	}

	return Object.extend("nw.epm.refapps.ext.prod.manage.model.RemoveService", {
		// The following arguments are required for all public methods of this class, therefore they are modeled as instance
		// variables that must be provided in the constructor.
		// _oODataModel: Data model in which the Delete service is to be executed
		// _oResourceBundle: Application resource bundle (i18n) for showing texts used in the confirmation dialog
		// _fnShowErrorMessage: Generic error handling if the OData Delete call is unsuccessful
		/* eslint-disable */ // using more then 4 parameters for a function is justified here
		constructor: function(oODataModel, oResourceBundle, oApplicationProperties, fnShowErrorMessage, fnDeleteListener, bBusy) {
			/* eslint-enable */
			this._oODataModel = oODataModel;
			this._oResourceBundle = oResourceBundle;
			this._oApplicationProperties = oApplicationProperties;
			this._oApplicationController = this._oApplicationProperties.getProperty("/applicationController");
			this._fnShowErrorMessage = fnShowErrorMessage;
			this._fnDeleteListener = fnDeleteListener;
			this._bBusy = bBusy;
		},

		// Deletes multiple products - First, the user is asked to confirm the deletion. If he/she does, the products are
		// deleted. Otherwise, nothing happens.
		// aProductPaths - Array of strings representing the context paths to each product to be deleted. Note that the data
		// for these products must already be loaded into the oData model (this._oODataModel).
		// fnAfterDeleted - Function that is to be called if the deletion is successful. Note that there
		// is no callback for the case that no deletion takes place (be it because the user cancelled the deletion, be it
		// because an error occurred, be it because aProductPaths is empty). fnAfterDeleted can contain a single Boolean
		// parameter. This parameter is set to true if all specified products have been deleted successfully. The parameter
		// is set to false if the mass deletion operation returned the information that at least one delete operation
		// was unsuccessful.
		deleteProducts: function(aProductPaths, fnAfterDeleted) {
			if (aProductPaths.length === 0) {
				return;
			}
			var sQuestion, sSuccessMessage; // The question that is presented to the user in the confirmation dialog
			if (aProductPaths.length === 1) {
				var sProductName = this._oODataModel.getProperty(fnGetPathWithSlash(aProductPaths[0]) + "/Name");
				sQuestion = this._oResourceBundle.getText("ymsg.deleteText", sProductName);
				sSuccessMessage = this._oResourceBundle.getText("ymsg.deleteSuccess", sProductName);
			} else {
				sQuestion = this._oResourceBundle.getText("ymsg.deleteProducts", aProductPaths.length);
				sSuccessMessage = this._oResourceBundle.getText("ymsg.deleteMultipleSuccess", aProductPaths.length);
			}
			var fnMyAfterDeleted = function(bTotalSuccess) {
				if (bTotalSuccess) {
					MessageToast.show(sSuccessMessage);
				}
				if (fnAfterDeleted) {
					fnAfterDeleted(bTotalSuccess);
				}
			};
			this._confirmDeletionByUser({
				bDraft: false,
				question: sQuestion
			}, aProductPaths, fnMyAfterDeleted);
		},

		// Convenience method for deleting exactly one product. For more information, see method deleteProducts. Note that
		// fnAfterDeleted is always called with the parameter value true (if it is called at all).
		deleteProduct: function(sPath) {
			this.deleteProducts([sPath]);
		},

		// Deletes one product draft (with confirmation dialog). Parameter sPath is the same as in method deleteEntityWithoutConfirmationDialog.
		// Parameters fnDeleteConfirmed and fnDeleteCanceled are like in method _confirmDeletionByUser.
		deleteProductDraft: function(sPath, fnDeleteConfirmed, fnDeleteCanceled) {
			var sQuestion = this._oResourceBundle.getText("ymsg.warningConfirm");
			// Confirmation dialog needs to have the title "Warning" instead of Delete
			var sTitle = this._oResourceBundle.getText("xtit.warning");
			// Product draft is deleted once the user confirms the deletion
			var fnConfirmed = function(oPromise) {
				if (fnDeleteConfirmed) {
					fnDeleteConfirmed(oPromise);
				}
			};
			this._confirmDeletionByUser({
				bDraft: true,
				title: sTitle,
				question: sQuestion,
				icon: MessageBox.Icon.WARNING
			}, [sPath], null, fnDeleteCanceled, fnConfirmed);
		},

		// Deletes an entity (such as a product, product draft, or image draft) without sending a confirmation dialog.
		// The parameters are identical to method deleteProducts.
		// Returns a Promise which is fulfilled, as soon as the operation was ended successfully.
		deleteEntityWithoutConfirmationDialog: function(sPath, fnAfterDeleted) {
			return this._callDeleteService([sPath], fnAfterDeleted);
		},

		// Opens a dialog letting the user either confirm or cancel the deletion of a list of entities. If the user
		// confirms, all the entities are deleted.
		// oConfirmation - Configuration of the confirmation dialog. Possesses up to two attributes:
		// (i) question (obligatory) is a string providing the statement presented to the user
		// (ii) title (optional) may be a string defining the title of the popup.
		// The default title is 'Delete'.
		// aPaths - Array of strings representing the context paths to the entities to be deleted. Note that it is currently
		// assumed that the specified entities are all products if there is more than one entity.
		// fnAfterDeleted (optional) - works as in method deleteProducts
		// fnDeleteCanceled (optional) - called when the user decides not to perform the deletion
		// fnDeleteConfirmed (optional) - called when the user decides to perform the deletion. A Promise will be passed
		// to this function which will be resolved as soon as the deletion was performed in the backend.
		/* eslint-disable */ // using more then 4 parameters for a function is justified here
		_confirmDeletionByUser: function(oConfirmation, aPaths, fnAfterDeleted, fnDeleteCanceled, fnDeleteConfirmed) {
			/* eslint-enable */
			// Callback function for when the user decides to perform the deletion
			var fnDelete = function() {
				// Calls the oData Delete service
				var oPromise = this._callDeleteService(aPaths, fnAfterDeleted);
				if (fnDeleteConfirmed) {
					fnDeleteConfirmed(oPromise);
				}
			}.bind(this);

			// Opens the confirmation dialog
			var sLeavePage = this._oResourceBundle.getText("xbut.leavePage");
			var sAction = (oConfirmation.bDraft) ? sLeavePage : MessageBox.Action.OK;
			MessageBox.show(oConfirmation.question, {
				icon: oConfirmation.icon || MessageBox.Icon.WARNING,
				title: oConfirmation.title || this._oResourceBundle.getText("xtit.delete"),
				actions: [sAction, MessageBox.Action.CANCEL],
				onClose: function(oAction) {
					if (oAction === sAction) {
						fnDelete();
					} else if (fnDeleteCanceled) {
						fnDeleteCanceled();
					}
				},
				styleClass: utilities.getContentDensityClass()
			});
		},

		// Performs the deletion of a list of entities. For more information about the parameters, see method
		// _confirmDeletionByUser.
		// Returns a Promise that will be resolved as soon as the deletion process ended successfully.
		_callDeleteService: function(aPaths, fnAfterDeleted) {
			if (this._bBusy) {
				this._oApplicationProperties.setProperty("/isBusyDeleting", true);
			}
			if (this._fnDeleteListener) {
				this._fnDeleteListener(true, aPaths);
			}
			// Creates an error handler and a success handler. Both of them release the busy dialog and forward to the
			// appropriate handlers.
			var fnFailed = function(oError) {
				jQuery.sap.log.error("EPM Refapp Products", "Failed to delete product while calling backend service");
				// Calls the error message handler
				this._fnShowErrorMessage(oError);
			}.bind(this);
			// Note that for the success handler, there are two slightly different cases (batch versus direct call of the
			// Delete service)
			var fnSuccess = function(bSuccessful) {
				if (this._bBusy) {
					this._oApplicationProperties.setProperty("/isBusyDeleting", false);
				}
				// Note that parameter bSuccessful can only be expected for batch processing. If the deletion is
				// performed directly, this success handler is only called when the success was complete (because only
				// one item was to be deleted)
				var bTotalSuccess = aPaths.length === 1 || bSuccessful;
				// Executes the callback function for successful deletion
				if (fnAfterDeleted) {
					// Note that parameter bSuccessful can only be expected for batch processing. If the deletion is
					// performed directly, this success handler is only called when the success was complete (because only
					// one item was to be deleted).
					fnAfterDeleted(bTotalSuccess);
				}
				if (this._fnDeleteListener) {
					this._fnDeleteListener(false, aPaths, bTotalSuccess);
				}
			}.bind(this);
			// Calls the remote Delete service if exactly one entity has been specified, otherwise try the
			// batch deletion
			return aPaths.length === 1 ? this._deleteOneEntity(aPaths[0], fnSuccess, fnFailed) : this._deleteProducts(aPaths, fnSuccess, fnFailed);
		},

		// Deletes one entity (such as a product, product draft, or image draft) specified by sPath. Then calls the
		// specified success or error handler.
		// Returns a Promise that is resolved when the operation was successful. 
		_deleteOneEntity: function(sPath, fnSuccess, fnFailed) {
			var oPromise = new Promise(function(fnResolve, fnReject) {
				this._oODataModel.remove(fnGetPathWithSlash(sPath), {
					success: fnResolve,
					error: fnReject,
					async: true
				});
			}.bind(this));
			oPromise.then(fnSuccess, fnFailed);
			return oPromise;
		},

		// Deletes products specified by a list of paths using batch processing. Calls the corresponding handlers depending
		// on success or error.
		// Returns a Promise that is resolved when the operation was successful.
		// Note that success handler fnAfterDeleted still contains parameter bSuccess to specify whether all specified
		// entities were able to be deleted successfully or not.
		_deleteProducts: function(aPaths, fnAfterDeleted, fnFailed) {
			var sDeferredBatchGroupId = "BatchDelete",
				iNotDeleted = 0,
				fnSingleRemoveFailed = function() {
					iNotDeleted++;
				},
				fnSuccess = function() {
					if (iNotDeleted) {
						// A message box appears to inform the user that not all items were deleted.
						this._showMessageForPartiallyFailedDeletes(iNotDeleted);
					}
					fnAfterDeleted(!iNotDeleted);
				}.bind(this),
				oPromise = new Promise(function(fnResolve, fnReject) {
					for (var i = 0; i < aPaths.length; i++) {
						this._oODataModel.remove(fnGetPathWithSlash(aPaths[i]), {
							error: fnSingleRemoveFailed,
							batchGroupId: sDeferredBatchGroupId,
							changeSetId: i.toString()
						});
					}
					this._oODataModel.submitChanges({
						batchGroupId: sDeferredBatchGroupId,
						success: fnResolve,
						error: fnReject
					});
				}.bind(this));
			oPromise.then(fnSuccess, fnFailed);
			return oPromise;
		},

		// Shows error message for the partially-unsuccessful removals
		_showMessageForPartiallyFailedDeletes: function(iFailedRemoves) {
			MessageBox.show(this._oResourceBundle.getText("ymsg.deleteNProductsFailed", iFailedRemoves), {
				icon: MessageBox.Icon.ERROR,
				title: this._oResourceBundle.getText("xtit.error"),
				styleClass: utilities.getContentDensityClass()
			});
		}
	});
});