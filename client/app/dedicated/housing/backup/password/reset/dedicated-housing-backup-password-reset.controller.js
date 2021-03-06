// --------------RENEW PASSWORD------------------

angular.module("App").controller("HousingRequestFtpBackupPasswordCtrl", ($scope, $stateParams, $translate, Housing, Alerter) => {
    "use strict";

    const alert = "housing_tab_ftpbackup_alert";
    $scope.ftpBackup = $scope.currentActionData;
    $scope.loading = false;

    $scope.requestFtpBackupPassword = function () {
        $scope.loading = true;

        Housing.requestFtpBackupPassword($stateParams.productId)
            .then(
                () => {
                    Alerter.success($translate.instant("housing_configuration_ftpbackup_lost_password_success"), alert);
                },
                (data) => {
                    Alerter.alertFromSWS($translate.instant("housing_configuration_ftpbackup_lost_password_failure"), data, alert);
                }
            )
            .finally(() => {
                $scope.resetAction();
            });
    };
});
