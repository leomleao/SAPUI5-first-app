sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/json/JSONModel",
	"sap/ui/Device",
	"sap/m/GroupHeaderListItem",
	"sap/m/ListMode",
	"./TableOperations",
	"./SubControllerForFGS",
	"nw/epm/refapps/ext/prod/manage/model/formatter"
], function(Controller, JSONModel, Device, GroupHeaderListItem, ListMode, TableOperations, SubControllerForFGS, formatter) {
	"use strict";

	return Controller.extend("nw.epm.refapps.ext.prod.manage.controller.S2_ProductMaster", {
		formatter: formatter,

		// --- Helper attributes that are initialized during onInit and never changed afterwards

		// _oViewProperties: json model used to manipulate declarative attributes of the controls used in this view. Initialized in _initViewPropertiesModel.
		// contains the following attributes:
		// - title                - the current title of the master list
		// - markExists           - in multi-select mode: info whether at least one entry is marked
		// - filterToolbarVisible - flag whether the filter toolbar is visible on top of the master list
		// - filterInfoText       - text of the filter toolbar
		// _oView: this view
		// _oList: the master list
		// _oItemTemplate: template of one list item. Used for modifying the list binding.
		// _oSearchField: the search field
		// _oApplicationController: the controller of the App
		// _oApplicationProperties: json model containing the App state
		// _oResourceBundle: the resource bundle to retrieve texts from
		// _oHelper: singleton instance of nw.epm.refapps.ext.prod.manage.model.Products used to call backend services
		// _oTableOperations: instance of nw.epm.refapps.ext.prod.manage.controller.TableOperations used for backend handling of list operations
		// _oSubControllerForFGS: instance of nw.epm.refapps.ext.prod.manage.controller.SubControllerForFGS used for frontend handling of list operations

		// --- Attributes describing the current state of the master list. They are changed while the App is running.

		// _iMarkedCount:number of items selected in multi-selection mode.
		// _sCurrentSearchTerm: the search term that is currently used to filter the result list
		// _fnAdaptListAfterUpdate: An optional function that will be executed when a list update finishes the next time

		// --- Initialization

		onInit: function() {
			this._iMarkedCount = 0;
			this._sCurrentSearchTerm = "";
			this._oView = this.getView();
			this._oList = this.byId("list");
			this._oSearchField = this.byId("SearchField");
			var oComponent = this.getOwnerComponent();
			this._oApplicationProperties = oComponent.getModel("appProperties");
			this._oApplicationController = this._oApplicationProperties.getProperty("/applicationController");
			this._oApplicationController.registerMaster(this);
			this._oResourceBundle = oComponent.getModel("i18n").getResourceBundle();
			this._oHelper = this._oApplicationController.getODataHelper();
			this._oTableOperations = new TableOperations(this._oList, ["Name", "Id", "Description"]);
			this._initViewPropertiesModel();
			// Initializes the sub-controller for handling filter, grouping, and sorting dialogs
			this._oSubControllerForFGS = new SubControllerForFGS(this._oView,
				this._oTableOperations, this.applyTableOperations.bind(this), this._oResourceBundle);
		},

		_initViewPropertiesModel: function() {
			// The model created here is used to set values or view element properties that cannot be bound
			// directly to the OData service. Setting view element attributes by binding them to a model is preferable to the
			// alternative of getting each view element by its ID and setting the values directly because a JSon model is more
			// robust if the customer removes view elements (see extensibility).
			this._oViewProperties = new JSONModel({
				title: this._oResourceBundle.getText("xtit.masterTitleWithoutNumber"),
				markExists: false,
				filterToolbarVisible: false,
				filterInfoText: ""
			});
			this._oView.setModel(this._oViewProperties, "viewProperties");
		},

		// --- Methods dealing with refresh of the list

		applyTableOperations: function() {
			// This method is called when a new backend search has to be triggered, due to changed 'search settings'.
			// More precisely the method is called:
			// - when the user presses Sort, Filter, or Group button (therefore, it is passed as callback to SubControllerForFGS)
			// - when the user triggers a search after having changed the entry in the search field
			// The method uses attribute _oTableOperations to perform the data retrieval
			this._oTableOperations.applyTableOperations();
			if (!Device.system.phone) {
				this._fnAdaptListAfterUpdate = function() {
					var sProductId = this._oApplicationProperties.getProperty("/productId"),
						oListItem = this._getListItemForId(sProductId);
					this._scrollToListItem(oListItem);
				}.bind(this);
			}
		},

		createGroupHeader: function(oGroup) {
			// Group header factory. Attached to the list declaratively.
			return new GroupHeaderListItem({
				title: oGroup.text,
				upperCase: false
			});
		},

		onUpdateStarted: function() {
			// Event handler called when updater of the the master list starts. It is attached declaratively.
			// Resets the displayed content of the search field to the search term that is actually used.
			// There may be a difference, as the user might have changed the content but not triggered the search.
			this._oSearchField.setValue(this._sCurrentSearchTerm);
			this._oApplicationProperties.setProperty("/isListLoading", true);
		},

		onUpdateFinished: function() {
			// Event handler called after the the master list has been updated. It is attached declaratively.
			if (this._oApplicationProperties.getProperty("/metaDataLoadState") < 1) {
				return;
			}
			this._oApplicationProperties.setProperty("/isListLoading", false);
			this._oApplicationProperties.setProperty("/masterBusyIndicatorDelay", null);
			var iCount = this._getListBinding().getLength(),
				sTitle = this._oResourceBundle.getText("xtit.masterTitleWithNumber", [iCount]);
			this._oViewProperties.setProperty("/title", sTitle);
			if (iCount === 0) {
				var sNoDataId = ((this._oTableOperations.getSearchTerm() || this._oTableOperations.getFilterTable()) ? "ymsg.noDataAfterSerach" :
					"ymsg.noProducts");
				this._oApplicationProperties.setProperty("/listNoDataText", this._oResourceBundle.getText(sNoDataId));
			}
			if (this._isListInMultiSelectMode()) {
				this._iMarkedCount = this._oList.getSelectedContexts(true).length;
				this._oViewProperties.setProperty("/markExists", this._iMarkedCount > 0);
			}
			// If not on the phone, make sure that a PO is selected (if possible)
			this.findItem();
			if (this._fnAdaptListAfterUpdate) {
				this._fnAdaptListAfterUpdate();
				this._fnAdaptListAfterUpdate = null;
			}
		},

		listRefresh: function() {
			this._getListBinding().refresh();
		},

		adaptToDetailSelection: function(bScrollTo) {
			// adapt the state of the master list to the object displayed in the detail area
			// This contains two aspects:
			// - set the corresponding list item as selected
			// - scroll to the corresponding list item (only if bScrollTo is true)
			if (this._oApplicationProperties.getProperty("/isListLoading") || this._oApplicationProperties.getProperty("/metaDataLoadState") < 1) {
				// Postpone until the list has been loaded
				this._fnAdaptListAfterUpdate = this._selectCurrentItem.bind(this, bScrollTo);
			} else {
				this._selectCurrentItem(bScrollTo);
			}
		},

		_selectCurrentItem: function(bScrollTo) {
			// this method has the same specification as adaptToDetailSelection. However, it must not be called
			// while the list is still loading.
			if (Device.system.phone || this._isListInMultiSelectMode()) {
				return;
			}
			var sProductId = this._oApplicationProperties.getProperty("/productId"),
				oItemToSelect = sProductId && this._getListItemForId(sProductId);
			if (oItemToSelect === this._oList.getSelectedItem()) {
				return;
			}
			this._setItemSelected(oItemToSelect);
			if (bScrollTo && oItemToSelect) {
				this._scrollToListItem(oItemToSelect);
			}
		},

		findItem: function() {
			// This method has four tasks:
			// - Check whether it is necessary to identify a new list item to be displayed in the detail area (if not return immediately)
			// - Determine the required list item
			// - Execute the navigation that displays the identified list item (or execute the navigation to the EmptyPage if no list item could be identified)
			// - Reset state		    
			if (Device.system.phone || this._oApplicationProperties.getProperty("/productId")) { // Task 1
				return;
			}
			// Task 2
			var aItems = this._oList.getItems();
			if (aItems.length > 0) {
				var oItemToSelect = null,
					aPreferredIds = this._oApplicationProperties.getProperty("/preferredIds");
				for (var i = 0; !oItemToSelect && i < aPreferredIds.length; i++) {
					oItemToSelect = this._getListItemForId(aPreferredIds[i]);
				}
				oItemToSelect = oItemToSelect || this._getFirstRealItem();
				this._navToListItem(oItemToSelect); // Task 3
			} else {
				this._oApplicationController.navToEmptyPage(this._oApplicationProperties.getProperty("/listNoDataText"), true); // Task 3
			}
			this._oApplicationProperties.setProperty("/preferredIds", []); // Task 4
		},

		prepareForDelete: function(sCurrentId) {
			// This method is called before a delete operation is called. 
			// The task of this method is to set the preferredIds in the global application model.
			// This array will be checked afterwards to determine the item in the list which will be selected.
			// More precisely the first product in this array which occurs in the list after the deletion process will be selected.
			// sCurrentId can be faulty (which would mean that currently no item is selected in the detail area -> preferred ids is set to the empty array).
			// Otherwise sCurrentId is the id of the product currently displayed in the detail area, and sCurrentId is one of the
			// objects to be deleted.
			// The preferredIds are set to the ids of the products currently displayed in the list, sorted according the following order:
			// If the current list contains an item corresponding to sCurrentId, sCurrentId will be the first one in the list.
			// It will be followed by the ids of the list items behind this item in the normal order. After that we add the ids
			// of the list items in front of the identified one, but in reverse order.
			// Otherwise the preferred ids are the ids of current list in their normal order.
			// So when the current order is a, b, c, d, e and sCurrentId is c, then the preferred ids will be c, d, e, b, a.
			// Note that according to the precondition c itself identifies one of the objects to be deleted. Therefore, the first entry
			// in the list will only be used later, when the deletion of this particular object fails for some reason.
			var aPreferredIds = [];
			if (sCurrentId) {
				var bFound = false,
					aListItems = this._oList.getItems(),
					aTail = [];
				for (var i = 0; i < aListItems.length; i++) {
					var oItem = aListItems[i];
					if (!(oItem instanceof GroupHeaderListItem)) {
						var oCtx = oItem.getBindingContext(),
							sId = oCtx.getProperty("Id");
						bFound = bFound || sId === sCurrentId;
						(bFound ? aPreferredIds : aTail).push(sId);
					}
				}
				if (bFound) {
					aTail.reverse();
					aPreferredIds = aPreferredIds.concat(aTail);
				}
			}
			this._oApplicationProperties.setProperty("/preferredIds", aPreferredIds);
		},

		_getListBinding: function() {
			return this._oList.getBinding("items");
		},

		// --- Methods dealing with new data retrieval triggered by the user. All event handlers are attached declaratively.

		onSearch: function(oEvent) {
			// Event handler for the search field in the master list.
			// Note that this handler listens to the search button and to the refresh button in the search field
			var oSearchField = oEvent.getSource(),
				sCurrentSearchFieldContent = oSearchField.getValue(),
				// If the user has pressed 'Refresh' the last search should be repeated
				sNewSearchContent = oEvent.getParameter("refreshButtonPressed") ? this._sCurrentSearchTerm : sCurrentSearchFieldContent;
			this._explicitRefresh(sNewSearchContent);
		},

		_explicitRefresh: function(sNewSearchContent, fnNoMetadata) {
			// This method is called when the user refreshes the list either via the search field or via the pull-to-refresh element
			// sNewSearchContent is the content of the search field to be applied.
			// Note: In case metadata could not be loaded yet or lost draft information could not be determined yet, it is first triggered
			// to retry this. If loading of the metadata fails (optional) fnNoMetadata will be executed.
			var fnMetadataLoaded = function() {
				if (sNewSearchContent === this._sCurrentSearchTerm) {
					this.listRefresh();
				} else {
					this._sCurrentSearchTerm = sNewSearchContent;
					this._oTableOperations.setSearchTerm(sNewSearchContent);
					this.applyTableOperations();
				}
			}.bind(this);
			this._oApplicationController.whenMetadataLoaded(fnMetadataLoaded, fnNoMetadata);
		},

		onPullToRefresh: function(oEvent) {
			// Event handler for the pullToRefresh-element of the list.
			var oPullToRefresh = oEvent.getSource(),
				fnHidePullToRefresh = function() { // hide the pull to refresh when list has been refreshed or meta data call fails once more
					// Note: Do not use oEvent here, because UI5 might have reinitialized this instance already (instance pooling for performance reasons)
					oPullToRefresh.hide();
				};
			// Hide the pull to refresh when data has been loaded
			this._oList.attachEventOnce("updateFinished", fnHidePullToRefresh);
			// Refresh list from backend
			this._explicitRefresh(this._sCurrentSearchTerm, fnHidePullToRefresh);
		},

		// - Event handlers for the Sort, Filter, and Group buttons. They delegate to attribute _oSubControllerForFGS.

		onSortPressed: function() {
			this._oSubControllerForFGS.openDialog("ProductSortDialog", "Name");
		},

		onFilterPressed: function() {
			this._oSubControllerForFGS.openDialog("ProductFilterDialog");
		},

		onGroupPressed: function() {
			this._oSubControllerForFGS.openDialog("ProductGroupingDialog");
		},

		// --- Event handlers for additional buttons in the footer of the master area. They are attached declaratively.

		onAddPressed: function() {
			var fnProductDraftCreated = function(oProductDraftData) {
				this._oApplicationProperties.setProperty("/isDirty", false);
				this._oApplicationController.navToProductEditPage(oProductDraftData.Id);
				this._removeAllSelections();
				this._oApplicationController.hideMasterInPortrait();
			}.bind(this);
			this._oHelper.createProductDraft(fnProductDraftCreated);
		},

		onDeletePressed: function() {
			var aContexts = this._oList.getSelectedContexts(true),
				aProductsToBeDeleted = [];
			jQuery.each(aContexts, function(iIndex, oContext) {
				aProductsToBeDeleted.push(oContext.getPath());
			});
			var fnAfterDeleted = function() {
				this._removeAllSelections();
			}.bind(this);
			this._oHelper.deleteProducts(aProductsToBeDeleted, fnAfterDeleted);
		},

		// --- Methods dealing with multi-select

		onMultiSelectPressed: function() {
			// Event handler for the multi-selection button in the page header. It is attached declaratively.
			var bWasMultiSelect = this._isListInMultiSelectMode();
			this._setMultiSelect(!bWasMultiSelect);
		},

		_setMultiSelect: function(bMultiSelect) {
			// set the master list to multi-select or single select as specified by bMultiSelect
			if (bMultiSelect === this._isListInMultiSelectMode()) {
				return;
			}
			this._oApplicationProperties.setProperty("/isMultiSelect", bMultiSelect);
			this._removeAllSelections();
			if (!bMultiSelect && !Device.system.phone) {
				var oSelectedItem = this._getListItemForId(this._oApplicationProperties.getProperty("/productId"));
				this._setItemSelected(oSelectedItem);
			}
		},

		_isListInMultiSelectMode: function() {
			// helper method to check if the current list is currently in the MultiSelect mode
			return this._oList.getMode() === ListMode.MultiSelect;
		},

		_removeAllSelections: function() {
			// set all items as unselected
			this._oList.removeSelections(true);
			this._iMarkedCount = 0;
			this._oViewProperties.setProperty("/markExists", false);
		},

		// --- Event handlers for additional UI elements. All of them are attached declaratively.

		onNavButtonPress: function() {
			// Handler for the nav button of the page.
			this._oApplicationController.navBack(false);
		},

		onSwipe: function(oEvent) {
			// Event handler for swipe in the list.
			// Its purpose is to deactivate swipe in case of multi select and in edit mode.
			if (this._isListInMultiSelectMode() || this._isInEditMode()) {
				oEvent.preventDefault();
			}
		},

		onSwipeDeleteItem: function() {
			// user has confirmed the deletion via swipe
			var oBindingContext = this._oList.getSwipedItem().getBindingContext();
			this._oHelper.deleteProduct(oBindingContext.getPath(), null, true);
			this._oList.swipeOut();
		},

		onItemSelect: function(oEvent) {
			// Event handler for the case that the user selects one item in the master list.
			// Note: This method is referred twice in the declarative definition of this view.
			// The first reference is event 'selectionChange' of the master list; the second one is 'press' on the list item.
			// The second reference is needed in case the list mode is 'None' (which is true on phone).
			// Determine the list item that was selected. Note that the techique to retrieve this from the event depends
			// on the list mode (in other words, the event we are currently listening to).
			var oListItem = this._oList.getMode() === ListMode.None ? oEvent.getSource() : oEvent.getParameter("listItem");

			var bMultiSelect = this._isListInMultiSelectMode();
			if (bMultiSelect) { // in multi-select mode select mode selecting the list item inverts the current selection state
				if (oEvent.getParameter("selected")) { // the item turns into selected
					this._iMarkedCount++;
					if (!Device.system.phone) { // in this case the newly selected item should be displayed in the detail area,
						this._navToListItem(oListItem);
					}
				} else { // the item turns into unselected
					this._iMarkedCount--;
				}
				this._oViewProperties.setProperty("/markExists", this._iMarkedCount > 0);
			} else { // in single-select mode the user wants to navigate to the selected item
				if (this._isInEditMode()) { // in edit mode a data-loss popup might be necessary
					var fnLeaveCancelled = function() { // called when user decides to cancel the navigation due to possible data-loss
						this._setItemSelected(this._getListItemForId(this._oApplicationProperties.getProperty("/productId"))); // set back selection to the item being edited (if it is in the list)
					};
					this._leaveEditPage(this._navToListItem.bind(this, oListItem), fnLeaveCancelled.bind(this));
				} else {
					this._navToListItem(oListItem);
				}
				this._oApplicationController.hideMasterInPortrait();
			}
		},

		// --- internal helper methods

		_navToListItem: function(oListItem) {
			// This method triggers the navigation to the detail page with the specified list item oListItem
			var oCtx = oListItem.getBindingContext(),
				sProductId = oCtx.getProperty("Id");
			this._oApplicationController.showProductDetailPage(sProductId);
		},

		_setItemSelected: function(oItemToSelect) {
			// Set the specified list item to be selected, resp. remove all selections if the specififed item is faulty
			if (oItemToSelect) {
				this._oList.setSelectedItem(oItemToSelect);
			} else {
				this._removeAllSelections();
			}
		},

		_getListItemForId: function(sId) {
			// Return the list item for the specified product id or a faulty value if the list does not contain the product.
			if (!sId || sId === "-") {
				return null;
			}
			var aItems = this._oList.getItems();
			for (var i = 0; i < aItems.length; i++) {
				var oItem = aItems[i];
				if (!(oItem instanceof GroupHeaderListItem)) {
					var oContext = oItem.getBindingContext();
					if (oContext && oContext.getProperty("Id") === sId) {
						return oItem;
					}
				}
			}
		},

		_scrollToListItem: function(oListItem) {
			// Scroll the list to the given list item.
			if (!oListItem || oListItem === this._getFirstRealItem()) {
				// If the item to scroll to is the first, just scroll to top. This ensures that the info toolbar and a top
				// grouping item will be shown if available.
				var oPage = this.byId("masterPage");
				oPage.scrollTo(0);
			} else {
				var oDomRef = oListItem.getDomRef();
				if (oDomRef) {
					oDomRef.scrollIntoView();
				}
			}
		},

		_isInEditMode: function() {
			return !this._oApplicationProperties.getProperty("/noEditMode");
		},

		_leaveEditPage: function(fnLeave, fnLeaveCancelled) {
			// leave the edit page. If the current draft is dirty the user will get a data loss poup.
			// fnLeave is the function that will be called when the edit page is really left
			// fnLeaveCancelled is the function that is called when the user cancels the operation
			var sPath = this._oHelper.getPathForDraftId(this._oApplicationProperties.getProperty("/productId"));
			this._oHelper.deleteProductDraft(sPath, fnLeave, fnLeaveCancelled);
		},

		_getFirstRealItem: function() {
			// Returns the first item of the list which is not a grouping item. Returns a faulty value if list is empty.
			var aItems = this._oList.getItems();
			for (var i = 0; i < aItems.length; i++) {
				if (!(aItems[i] instanceof GroupHeaderListItem)) {
					return aItems[i];
				}
			}
		}
	});
});