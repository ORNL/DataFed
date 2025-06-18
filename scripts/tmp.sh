mkdir -p "$HOST_LOG_FILE_PATH"
mkdir -p "${DATAFED_GLOBUS_DIR}"
cp "${CI_DATAFED_GCS_DEPLOYMENT_KEY}" "${DATAFED_GLOBUS_DIR}/deployment-key.json"
cp "${CI_DATAFED_GCS_CLIENT_CRED}" "${DATAFED_GLOBUS_DIR}/client_cred.json"
USER_ID=$(id -u)
chmod o+w "${HOST_LOG_FILE_PATH}"
chown gitlab-runner "$HOST_LOG_FILE_PATH"
./scripts/generate_datafed.sh
./scripts/container_stop.sh -n "${COMPONENT}" -p
random_string=$(bash -c "cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w "10" | head -n 1")
echo "#!/bin/bash" > run_globus.sh
echo "docker run \\" >> run_globus.sh
echo "--name datafed-gcs-test-${random_string}\" \\" >> run_globus.sh
echo "--network host \\" >> run_globus.sh
echo "-e DATAFED_GLOBUS_APP_SECRET=\"$CI_DATAFED_GLOBUS_APP_SECRET\" \\" >> run_globus.sh
echo "-e DATAFED_GLOBUS_APP_ID=\"$CI_DATAFED_GLOBUS_APP_ID\" \\" >> run_globus.sh
echo "-e DATAFED_ZEROMQ_SESSION_SECRET=\"$CI_DATAFED_ZEROMQ_SESSION_SECRET\" \\" >> run_globus.sh
echo "-e DATAFED_ZEROMQ_SYSTEM_SECRET=\"$CI_DATAFED_ZEROMQ_SYSTEM_SECRET\" \\" >> run_globus.sh
echo "-e DATAFED_DOMAIN=\"$CI_DATAFED_DOMAIN\" \\" >> run_globus.sh
echo "-e DATAFED_HTTPS_SERVER_PORT=\"443\" \\" >> run_globus.sh
echo "-e DATAFED_DEFAULT_LOG_PATH=\"$CONTAINER_LOG_FILE_PATH\" \\" >> run_globus.sh
echo "-e DATAFED_CORE_ADDRESS_PORT_INTERNAL=\"${CI_DATAFED_DOMAIN}:7513\" \\" >> run_globus.sh
echo "-e DATAFED_GCS_ROOT_NAME=\"${CI_DATAFED_GCS_ROOT_NAME}\" \\" >> run_globus.sh
echo "-e DATAFED_GCS_COLLECTION_BASE_PATH=\"/mnt\" \\" >> run_globus.sh
echo "-e DATAFED_GCS_COLLECTION_ROOT_PATH=\"/mnt/datafed\" \\" >> run_globus.sh
echo "-e DATAFED_GLOBUS_SUBSCRIPTION=\"${CI_DATAFED_GLOBUS_SUBSCRIPTION}\" \\" >> run_globus.sh
echo "-e DATAFED_GLOBUS_CONTROL_PORT=\"443\" \\" >> run_globus.sh
echo "-e DATAFED_REPO_USER=\"datafed\" \\" >> run_globus.sh
echo "-e DATAFED_AUTHZ_USER=\"datafed\" \\" >> run_globus.sh
echo "-e UID=\"$USER_ID\" \\" >> run_globus.sh
echo "-e BUILD_WITH_METADATA_SERVICES=\"FALSE\" \\" >> run_globus.sh
echo "-e DATAFED_REPO_ID_AND_DIR=\"${CI_DATAFED_REPO_ID_AND_DIR}\" \\" >> run_globus.sh
echo "-e DATAFED_GCS_IP=\"${CI_DATAFED_GCS_IP}\" \\" >> run_globus.sh
echo "-e DATAFED_REPO_DOMAIN=\"${CI_DATAFED_REPO_DOMAIN}\" \\" >> run_globus.sh
echo "-v \"${DATAFED_GLOBUS_DIR}:/opt/datafed/globus\" \\" >> run_globus.sh
echo "-v \"${HOST_LOG_FILE_PATH}:${CONTAINER_LOG_FILE_PATH}\" \\" >> run_globus.sh
echo "-v \"${DATAFED_HOST_COLLECTION_MOUNT}:/mnt/datafed\" \\" >> run_globus.sh
echo "--entrypoint bash \\" >> run_globus.sh
echo "-t datafed-gcs:latest\\" >> run_globus.sh
echo "-c 'cd /datafed/source; /opt/datafed/dependencies/bin/cmake --build build --target test'" >> run_globus.sh
chmod +x run_globus.sh
./run_globus.sh
