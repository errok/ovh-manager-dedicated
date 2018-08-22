angular
    .module("Billing.components")
    .component("billingAutoRenewUpdate", {
        bindings: {
            servicesToChangeRenewalOf: "<"
        },
        templateUrl: "account/billing/autoRenew/Update/billing-autoRenew-update.html",
        controller: "billingAutoRenewUpdateCtrl"
    });
