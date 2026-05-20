// Merge this snippet into AcademicLedger.sol, then redeploy and regenerate
// contracts/AcademicLedger.json from the compiled ABI.
//
// The current app uses string project IDs such as "DLT_Research2026". If your
// canonical contract uses uint256 project IDs, change each string calldata
// _projectId parameter below to uint256 _projectId and adjust mappings
// accordingly.

struct ProjectFinalization {
    bool isFinalizationActive;
    uint256 finalizationDeadline;
    bool isFinalized;
    string sealedReceiptCid;
    uint256 executedAt;
}

struct Contribution {
    address contributor;
    string cid;
    string creditRole;
    uint256 timestamp;
}

struct ProjectReceipt {
    string cid;
    address[] contributors;
    string[] roles;
    uint256 executedAt;
}

mapping(string => ProjectFinalization) public projectFinalization;
mapping(string => Contribution[]) private projectContributions;

event ProjectSealed(
    string indexed projectId,
    string cid,
    address[] contributors,
    string[] roles,
    uint256 timestamp
);

modifier notFinalized(string calldata _projectId) {
    require(!projectFinalization[_projectId].isFinalized, "Project finalized");
    _;
}

// Apply notFinalized(_projectId) to every project-mutating function, for example:
//
// function logContribution(
//     string calldata _projectId,
//     string calldata _cid,
//     string calldata _creditRole
// ) external notFinalized(_projectId) { ... }
//
// function authorizeCollaborator(
//     string calldata _projectId,
//     address _collaborator
// ) external onlyProjectAdmin(_projectId) notFinalized(_projectId) { ... }
//
// function revokeCollaborator(...) external notFinalized(_projectId) { ... }
// function transferProjectAdmin(...) external notFinalized(_projectId) { ... }
// function disputeContribution(...) external notFinalized(_projectId) { ... }
// function flagContributionAsDisputed(...) external notFinalized(_projectId) { ... }
// function resolveDispute(...) external notFinalized(_projectId) { ... }
// function haltFinalization(...) external notFinalized(_projectId) { ... }

function executeFinalization(
    string calldata _projectId,
    string calldata _sealedReceiptCid
) external onlyProjectAdmin(_projectId) notFinalized(_projectId) {
    ProjectFinalization storage finalization = projectFinalization[_projectId];
    require(finalization.isFinalizationActive, "Finalization not active");
    require(block.timestamp >= finalization.finalizationDeadline, "Deadline not reached");
    require(bytes(_sealedReceiptCid).length > 0, "Receipt CID required");

    Contribution[] storage contributions = projectContributions[_projectId];
    address[] memory contributors = new address[](contributions.length);
    string[] memory roles = new string[](contributions.length);

    for (uint256 i = 0; i < contributions.length; i += 1) {
        contributors[i] = contributions[i].contributor;
        roles[i] = contributions[i].creditRole;
    }

    finalization.isFinalized = true;
    finalization.isFinalizationActive = false;
    finalization.sealedReceiptCid = _sealedReceiptCid;
    finalization.executedAt = block.timestamp;

    emit ProjectSealed(
        _projectId,
        _sealedReceiptCid,
        contributors,
        roles,
        block.timestamp
    );
}

function getProjectReceipt(
    string calldata _projectId
) external view returns (
    string memory cid,
    address[] memory contributors,
    string[] memory roles,
    uint256 executedAt
) {
    ProjectFinalization storage finalization = projectFinalization[_projectId];
    require(finalization.isFinalized, "Project not finalized");

    Contribution[] storage contributions = projectContributions[_projectId];
    contributors = new address[](contributions.length);
    roles = new string[](contributions.length);

    for (uint256 i = 0; i < contributions.length; i += 1) {
        contributors[i] = contributions[i].contributor;
        roles[i] = contributions[i].creditRole;
    }

    return (
        finalization.sealedReceiptCid,
        contributors,
        roles,
        finalization.executedAt
    );
}
