#define BOOST_TEST_MAIN
#define BOOST_TEST_MODULE repository_service_identity
#include <boost/test/unit_test.hpp>
#include "RepositoryServiceIdentity.hpp"

using namespace SDMS;
using namespace SDMS::Core;

BOOST_AUTO_TEST_CASE(shared_service_requires_matching_key_address_and_collection) {
  RepoData bam;
  bam.set_id("repo/bam");
  bam.set_pub_key(std::string(40, 'k'));
  bam.set_endpoint("11111111-1111-1111-1111-111111111111");
  bam.set_address("tcp://repo:9000");
  RepoData bambar = bam;
  bambar.set_id("repo/bambar");
  std::map<std::string, RepoData> repos{{bam.id(), bam}, {bambar.id(), bambar}};

  BOOST_CHECK(repositoryServiceMayAuthorize(repos, bam.id(), bam.id()));
  BOOST_CHECK(repositoryServiceMayAuthorize(repos, bam.id(), bambar.id()));
  BOOST_CHECK(repositoryServiceMayAuthorize(repos, bambar.id(), bam.id()));
  BOOST_CHECK(!repositoryServiceMayAuthorize(repos, "u/alice", bam.id()));
  BOOST_CHECK(!repositoryServiceMayAuthorize(repos, bam.id(), "repo/missing"));

  repos[bambar.id()].set_endpoint("22222222-2222-2222-2222-222222222222");
  BOOST_CHECK(!repositoryServiceMayAuthorize(repos, bam.id(), bambar.id()));
  repos[bambar.id()] = bambar;
  repos[bambar.id()].set_pub_key(std::string(40, 'x'));
  BOOST_CHECK(!repositoryServiceMayAuthorize(repos, bam.id(), bambar.id()));
  repos[bambar.id()] = bambar;
  repos[bambar.id()].set_address("tcp://other:9000");
  BOOST_CHECK(!repositoryServiceMayAuthorize(repos, bam.id(), bambar.id()));
  repos[bam.id()].clear_pub_key();
  BOOST_CHECK(!repositoryServiceMayAuthorize(repos, bam.id(), bam.id()));
}
