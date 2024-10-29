#!/opt/globus/bin/python3
"""
NOTE: this script must be run using /opt/globus/bin/python3 to work correctly.
This requires installing globus-connect-server54 which will populate the
python interpreter, along with the globus modules that are not part of the pip
packages.

delete_node_keys

This script will pull down the endpoint's keychain and delete existing node keys with
the following caveats:

- Since nodes and node keys can not be correlated in the config, there must be no node
  definitions in the endpoint in order to avoid breaking active nodes.
- The deployment key will be the only remaining node key in the appsync configuration.
- This script must be supplied the client_id, secret and deployment key since it can
  not be run from an active node because of the first caveat.

This is intended to fix endpoints where `node setup` has failed after inserting a new
node key into the keychain but before adding the node to the endpoint's domain. The
keychain will grow too large (216 node keys) without pruning.

This script can be run as any user.

This script was provided by the Globus team as a result of a support ticket.
"""

import os
import click
import globus_sdk
import globus.manager.api.models as models
import json
import sys
import textwrap
from globus.manager.api.app import make_app
from globus.manager.utils.keychain import NodeKey


class NodeKeyFileParam(click.File):
    """
    Structure to automatically load a NodeKey from a click
    input parameter.
    """

    name = "node_key_file"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    def convert(self, value, param, ctx):
        with super().convert(value, param, ctx) as f:
            try:
                node_key = NodeKey(**json.load(f))
            except Exception as e:
                self.fail("Error parsing {}: {}".format(value, str(e)), param, ctx)
        return node_key


@click.command()
@click.option(
    "--client-id",
    "-c",
    help="Auth Client ID for this Globus Connect Server Endpoint",
    required=True,
)
@click.option(
    "--secret",
    "-s",
    help="Client secret for the auth client",
    prompt=True,
    hide_input=True,
    envvar="GLOBUS_CLIENT_SECRET",
    show_envvar=True,
    required=True,
    hidden=True,
)
@click.option(
    "--deployment-key",
    help="Path to deployment key",
    type=NodeKeyFileParam(),
    required=True,
)
@click.pass_context
def delete_node_keys(
    ctx,
    client_id,
    secret,
    deployment_key,
):
    # Use the endpoint_cli config for the DB in memory
    app = make_app(app_config="globus.manager.api.config.endpoint_cli")
    models.db.init_app(app)

    with app.app_context():
        # Layout in-memory DB tables
        models.db.create_all()
        models.db.session.commit()

        # Configure our app
        app.config["CLIENT_ID"] = str(client_id)
        app.config["CLIENT_SECRET"] = secret
        app.config["ENVIRONMENT"] = os.environ.get(
            "GLOBUS_SDK_ENVIRONMENT", "production"
        )
        app.config["DEPLOYMENT_KEY"] = deployment_key

        # Make sure the GCS services in AWS are accessible
        try:
            appsync_client = app.appsync_client
            if appsync_client is None:
                click.echo("Unable to contact Globus services", err=True)
                ctx.exit(1)
        except globus_sdk.GlobusAPIError:
            click.echo(
                "\n".join(
                    textwrap.wrap(
                        "Unable to contact Globus services with provided client "
                        "id and secret. Please verify that those values are "
                        "correct."
                    )
                ),
                err=True,
            )
            ctx.exit(1)

        # Pull down the keychain which will give us access to the data key thanks
        # to our deployment key in our config
        items = app.appsync_client.query_all(id="KEY_CHAIN")
        for item in items:
            app.appsync_client.process_item(item)

        # Pull down the node definitions
        items = app.appsync_client.query_all(id="WILDCARD_DOMAIN")
        if not items:
            click.echo(
                "This endpoint has never been setup; nothing to delete.",
                err=True,
            )
            ctx.exit(1)

        assert len(items) == 1
        globus_dns_domain = app.appsync_client.process_item(
            items[0], catch_exceptions=False
        )
        assert globus_dns_domain

        # Verify that we have something to delete
        if len(app.keychain.node_keys) == (len(globus_dns_domain.nodes) + 1):
            click.echo("No extra node keys to delete. Exiting.")
            ctx.exit(0)

        click.echo(f"Found {len(app.keychain.node_keys)-1} node key(s) to remove")
        for key in app.keychain.node_keys:
            if key.thumbprint() == deployment_key.thumbprint():
                click.echo("...skipping deployment key")
                continue
            click.echo(f"...deleting {key}")
            app.keychain.remove_node_key(key.thumbprint())

        # Update they keychain in appsync
        click.echo("Commiting updated keychain to GCS cloud services...")
        app.appsync_client.update_object(app.keychain, ignore_response=True)


if __name__ == "__main__":
    delete_node_keys(sys.argv[1:])
