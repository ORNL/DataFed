=============================
Development Environment Setup
=============================

Globus Setup
============

#. Log in to `Globus <https://app.globus.org>`_.
#. Navigate to Settings > Developers > Add Project.
#. Select an accurate name and contact email for your project.
#. Navigate to Add an App > Advanced Registration.
#. Choose an accurate name for your app, and in the redirects field add the single redirect ``https://localhost/ui/authn``
#. Click Add Client Secret and choose a descriptive name.
#. Take note of the Secret that it generates and the Client UUID of the Globus application and remember them for future steps.

Compose Setup
=============

#. Download the `DataFed Github Repository <https://github.com/ORNL/DataFed>`_.
#. Checkout to the ``devel`` branch.
#. Navigate into the ``compose`` folder and run ``./build_images_for_compose.sh``

   * Note: If you are building the images for the first time, it will take a while, however subsequent builds will use cached dependencies to accelerate the process.
#. Run the ``./generate_env.sh`` script, which will generate a ``.env`` file at this location and a self-signed certificate for the web interface to use.
#. Edit the ``.env`` file and set values for the following environment variables:

   * ``DATAFED_GLOBUS_APP_SECRET``: The app secret from the Globus setup
   * ``DATAFED_GLOBUS_APP_ID``: The app UUID from the Globus setup
   * ``DATAFED_ZEROMQ_SESSION_SECRET``: This can be any string
   * ``DATAFED_ZEROMQ_SYSTEM_SECRET``: This can be any string
#. Edit any other values in the ``.env`` file to fit your development needs.
#. Finally, run ``docker compose -f ./compose_core.yml up``, and after a few minutes the DataFed containers should be started and the web application should be accessible from https://localhost:443/

   * Note: Since the web interface is using a self-signed certificate your browser may not trust it, however, in this case it is safe to bypass this protection to visit the web app.
